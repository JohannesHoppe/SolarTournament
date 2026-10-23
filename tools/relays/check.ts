/**
 * Checks public Nostr relays the way the online tournament uses them and writes the healthiest
 * into `src/net/relays.json`, the relays every browser of the game connects to.
 *
 * Candidates come from three places: the relays already in the list, Trystero's built-in list,
 * and a relay directory: the NIP-66 relay discovery events (kind 30166) that independent relay
 * monitors publish on a few directory relays. A candidate the monitors report is only taken
 * when at least two of them saw it within the last hour and none says it requires auth,
 * payment, proof of work or restricted writes; the check below decides in any case, so a wrong
 * report costs nothing but a probe.
 *
 * 1. Read: every candidate is opened by WebSocket and asked for Trystero's subscription
 *    (NIP-01 REQ); it passes when it answers with EOSE within a few seconds.
 * 2. Write: the best readers are probed in three rounds a while apart. Each round subscribes,
 *    publishes WRITE_BURST ephemeral events at once, of the kind and shape Trystero signals with
 *    (built by Trystero's own code), and passes when the relay accepts every one (OK, not rate
 *    limited) and hands each back on the subscription. A relay that refuses is not asked again;
 *    the events are ephemeral (kinds 20000–29999 are not stored).
 *
 * The list keeps the relays that passed every round: those already in it first (so the list
 * stays stable and browsers of builds a week apart still meet), then the fastest, one per
 * operator (domain), up to LIST_SIZE. Latency is measured from wherever the check runs. The
 * file is only rewritten when the relays change; with fewer than MIN_RELAYS healthy ones it is
 * left alone and the check fails.
 *
 * Run with `npm run relays`; the workflow `.github/workflows/relays.yml` runs it every week.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvent, defaultRelayUrls, subscribe } from 'trystero';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LIST_PATH = join(root, 'src/net/relays.json');

/** How many relays every browser connects to: enough that two browsers share a working one, few enough to stay a light load. */
const LIST_SIZE = 12;
/** Fewer healthy relays than this and the list is kept as it is: something is wrong with the check or its network. */
const MIN_RELAYS = 6;
/** Directory relays carrying the NIP-66 monitors' reports (kind 30166). */
const DIRECTORY_RELAYS = ['wss://relay.nostr.watch', 'wss://monitorlizard.nostr1.com', 'wss://relaypag.es'];
/** Reports older than this (s) are not looked at. */
const DIRECTORY_WINDOW_S = 3600;
/** A relay a single monitor reports is not taken: monitors can be wrong or malicious (NIP-66). */
const MIN_MONITORS = 2;
/** Requirements (NIP-11 limitations, NIP-66 `R` tags) the game cannot meet. */
const UNMET_REQUIREMENTS = ['auth', 'payment', 'pow', 'writes'];
/** The directory's candidates probed at most, those seen by the most monitors first. */
const MAX_DIRECTORY_CANDIDATES = 150;
/** The readers probed for writing at most: the list's, then Trystero's, then the fastest. */
const MAX_WRITE_CANDIDATES = 64;
/** Rounds of the write probe, and the pause between them (ms): a relay has to pass all of them. */
const WRITE_ROUNDS = 3;
const ROUND_GAP_MS = 15_000;
/** Events published at once in each round: a joining browser sends its announcement and its first offers in a burst too. */
const WRITE_BURST = 3;
/** How long one step (opening, an answer) may take (ms). */
const STEP_TIMEOUT_MS = 5000;
/** Probes at a time. */
const CONCURRENCY = 32;

type Probe = { ok: true; ms: number } | { ok: false; why: string };

/** A relay URL as Trystero takes it, `wss://host[:port]`, or null for anything else (a path, Tor, plain ws). */
function normalize(url: string): string | null {
  try {
    const parsed = new URL(url.trim().toLowerCase());
    if (parsed.protocol !== 'wss:' || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) return null;
    if (parsed.hostname.endsWith('.onion') || parsed.hostname.endsWith('.i2p') || parsed.username) return null;
    return `wss://${parsed.host}`;
  } catch {
    return null;
  }
}

/** The operator behind a relay, roughly: its registrable domain (two labels, three under a country's second level like co.uk). */
function operator(url: string): string {
  const labels = new URL(url).hostname.split('.');
  const take = labels.length > 2 && labels.at(-1)!.length === 2 && labels.at(-2)!.length <= 3 ? 3 : 2;
  return labels.slice(-take).join('.');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Runs `task` over `items`, `CONCURRENCY` at a time. */
async function pool<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

/**
 * Opens a relay and talks to it: `start` runs once the socket is open, `decide` sees every
 * answer and settles the probe. Resolves with the time from opening the socket to the decision,
 * so the latency includes the connection, as a browser joining a tournament feels it.
 */
function talk(url: string, start: (socket: WebSocket) => void, decide: (message: unknown[], socket: WebSocket) => Probe | null, steps = 2): Promise<Probe> {
  return new Promise((resolve) => {
    const began = performance.now();
    let socket: WebSocket;
    let settled = false;
    const finish = (probe: Probe) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve(probe.ok ? { ok: true, ms: Math.round(performance.now() - began) } : probe);
    };
    const timer = setTimeout(() => finish({ ok: false, why: 'timeout' }), STEP_TIMEOUT_MS * steps);
    try {
      socket = new WebSocket(url);
    } catch (error) {
      return finish({ ok: false, why: `cannot open: ${(error as Error).message}` });
    }
    socket.onopen = () => start(socket);
    socket.onerror = () => finish({ ok: false, why: 'connection failed' });
    socket.onclose = () => finish({ ok: false, why: 'closed' });
    socket.onmessage = (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return finish({ ok: false, why: 'not JSON' });
      }
      if (!Array.isArray(message)) return;
      if (message[0] === 'NOTICE') return finish({ ok: false, why: `NOTICE ${String(message[1]).slice(0, 60)}` });
      if (message[0] === 'CLOSED') return finish({ ok: false, why: `CLOSED ${String(message[2]).slice(0, 60)}` });
      if (message[0] === 'AUTH') return;
      const probe = decide(message, socket);
      if (probe) finish(probe);
    };
  });
}

const randomId = () => crypto.randomUUID().replaceAll('-', '');

/** Trystero's subscription for a fresh topic of our own, answered with EOSE. */
function probeRead(url: string): Promise<Probe> {
  const subId = randomId();
  return talk(url, (socket) => socket.send(subscribe(subId, `solartournament-relay-check-${randomId()}`)), (message) =>
    message[0] === 'EOSE' && message[1] === subId ? { ok: true, ms: 0 } : null,
  );
}

/**
 * Subscribes, publishes a burst of ephemeral events as Trystero does when a browser joins (its
 * announcement and its first offers go out at once) and waits for every OK and every event
 * coming back. A relay that rate-limits such a burst holds a joining browser up for a minute.
 */
function probeWrite(url: string): Promise<Probe> {
  const subId = randomId();
  const topic = `solartournament-relay-check-${randomId()}`;
  const pending = new Set<string>();
  const accepted = new Set<string>();
  const echoed = new Set<string>();
  let sent = false;
  return talk(
    url,
    (socket) => socket.send(subscribe(subId, topic)),
    (message, socket) => {
      if (message[0] === 'EOSE' && message[1] === subId && !sent) {
        sent = true;
        void Promise.all(Array.from({ length: WRITE_BURST }, (_, i) => createEvent(topic, JSON.stringify({ check: 'solartournament', i })))).then((events: string[]) => {
          for (const event of events) pending.add((JSON.parse(event) as [string, { id: string }])[1].id);
          if (socket.readyState === 1) for (const event of events) socket.send(event);
        });
        return null;
      }
      if (message[0] === 'OK' && pending.has(String(message[1]))) {
        if (message[2] !== true) return { ok: false, why: `rejected: ${String(message[3]).slice(0, 60)}` };
        accepted.add(String(message[1]));
      }
      const id = (message[2] as { id?: string })?.id;
      if (message[0] === 'EVENT' && message[1] === subId && id && pending.has(id)) echoed.add(id);
      return pending.size && accepted.size === pending.size && echoed.size === pending.size ? { ok: true, ms: 0 } : null;
    },
    3,
  );
}

/** Asks a directory relay for the monitors' reports of the last hour. */
function readDirectory(url: string): Promise<{ tags: string[][]; pubkey: string }[]> {
  return new Promise((resolve) => {
    const events: { tags: string[][]; pubkey: string }[] = [];
    let socket: WebSocket;
    const done = () => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve(events);
    };
    const timer = setTimeout(done, 30_000);
    try {
      socket = new WebSocket(url);
    } catch {
      return done();
    }
    socket.onopen = () => socket.send(JSON.stringify(['REQ', 'directory', { kinds: [30166], since: Math.floor(Date.now() / 1000) - DIRECTORY_WINDOW_S, limit: 5000 }]));
    socket.onerror = done;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as unknown[];
      if (message[0] === 'EVENT') events.push(message[2] as { tags: string[][]; pubkey: string });
      else if (message[0] === 'EOSE' || message[0] === 'CLOSED') done();
    };
  });
}

/** The relays the monitors report healthy and open to everyone, seen by the most monitors first. */
async function directoryCandidates(): Promise<string[]> {
  const reports = new Map<string, { monitors: Set<string>; rtt: number[]; unmet: boolean }>();
  for (const [index, events] of (await Promise.all(DIRECTORY_RELAYS.map(readDirectory))).entries()) {
    console.log(`Directory ${DIRECTORY_RELAYS[index]}: ${events.length} reports`);
    for (const { tags, pubkey } of events) {
      const url = normalize(tags.find((tag) => tag[0] === 'd')?.[1] ?? '');
      if (!url || !Array.isArray(tags)) continue;
      const report = reports.get(url) ?? { monitors: new Set(), rtt: [], unmet: false };
      report.monitors.add(pubkey);
      const rtt = Number(tags.find((tag) => tag[0] === 'rtt-open')?.[1]);
      if (rtt > 0) report.rtt.push(rtt);
      if (tags.some((tag) => tag[0] === 'R' && UNMET_REQUIREMENTS.includes(tag[1]))) report.unmet = true;
      reports.set(url, report);
    }
  }
  return [...reports]
    .filter(([, report]) => report.monitors.size >= MIN_MONITORS && report.rtt.length && !report.unmet)
    .sort(([, a], [, b]) => b.monitors.size - a.monitors.size || median(a.rtt) - median(b.rtt))
    .slice(0, MAX_DIRECTORY_CANDIDATES)
    .map(([url]) => url);
}

function readList(): string[] {
  try {
    return (JSON.parse(readFileSync(LIST_PATH, 'utf8')) as { relays: string[] }).relays;
  } catch {
    return [];
  }
}

const current = readList();
const trystero = (defaultRelayUrls as string[]).map(normalize).filter((url): url is string => !!url);
const directory = await directoryCandidates();
const candidates = [...new Set([...current, ...trystero, ...directory])];
console.log(`Candidates: ${current.length} in the list, ${trystero.length} of Trystero, ${directory.length} from the directory, ${candidates.length} in all\n`);

const reads = await pool(candidates, probeRead);
const readers = candidates.map((url, i) => ({ url, read: reads[i] })).filter((entry) => entry.read.ok);
console.log(`Read: ${readers.length} of ${candidates.length} answered with EOSE`);
// the list's relays first, then Trystero's (built for its events), then the fastest of the rest
const rank = (url: string) => (current.includes(url) ? 0 : trystero.includes(url) ? 1 : 2);
const writeCandidates = readers
  .sort((a, b) => rank(a.url) - rank(b.url) || (a.read.ok ? a.read.ms : 0) - (b.read.ok ? b.read.ms : 0))
  .slice(0, MAX_WRITE_CANDIDATES)
  .map((entry) => ({ url: entry.url, probes: [] as Probe[] }));

for (let round = 0; round < WRITE_ROUNDS; round++) {
  if (round) await new Promise((resolve) => setTimeout(resolve, ROUND_GAP_MS));
  // a relay that refused once is not asked again
  const asked = writeCandidates.filter((entry) => entry.probes.every((probe) => probe.ok));
  const probes = await pool(asked, (entry) => probeWrite(entry.url));
  asked.forEach((entry, i) => entry.probes.push(probes[i]));
  console.log(`Write round ${round + 1}: ${probes.filter((probe) => probe.ok).length} of ${asked.length} took the events and handed them back`);
}

const results = writeCandidates.map(({ url, probes }) => {
  const failed = probes.find((probe) => !probe.ok);
  return {
    url,
    healthy: !failed,
    ms: failed ? Infinity : median(probes.map((probe) => (probe.ok ? probe.ms : 0))),
    why: failed && !failed.ok ? failed.why : '',
  };
});
results.sort((a, b) => a.ms - b.ms);

const chosen: string[] = [];
const operators = new Set<string>();
for (const result of [...results.filter((r) => current.includes(r.url)), ...results.filter((r) => !current.includes(r.url))]) {
  if (!result.healthy || chosen.length >= LIST_SIZE || operators.has(operator(result.url))) continue;
  chosen.push(result.url);
  operators.add(operator(result.url));
}

console.log('\nRelay                                             write ms  result');
for (const result of results) {
  const mark = chosen.includes(result.url) ? 'chosen' : result.healthy ? 'healthy' : `failed: ${result.why}`;
  console.log(`${result.url.padEnd(50)}${(result.healthy ? String(result.ms) : '-').padStart(8)}  ${mark}`);
}

if (chosen.length < MIN_RELAYS) {
  console.error(`\nOnly ${chosen.length} healthy relays (at least ${MIN_RELAYS} needed): ${LIST_PATH} is left as it is.`);
  process.exit(1);
}
chosen.sort();
if (chosen.length === current.length && chosen.every((url) => current.includes(url))) {
  console.log(`\nThe list is unchanged (${chosen.length} relays).`);
} else {
  writeFileSync(LIST_PATH, `${JSON.stringify({ updated: new Date().toISOString().slice(0, 10), relays: chosen }, null, 2)}\n`);
  console.log(`\nWrote ${chosen.length} relays to src/net/relays.json (added ${chosen.filter((url) => !current.includes(url)).length}, dropped ${current.filter((url) => !chosen.includes(url)).length}).`);
}
process.exit(0);
