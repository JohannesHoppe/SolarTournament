import { describe, expect, it, vi } from 'vitest';
import { keepPressing, keptPressing } from './kept';

type Handlers = { onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void; result?: unknown; error?: unknown };

/** A request that settles a moment later, as IndexedDB's do. */
function request(result: () => unknown, before?: (r: Handlers) => void): Handlers {
  const r: Handlers = {};
  setTimeout(() => {
    r.result = result();
    before?.(r);
    r.onsuccess?.();
  });
  return r;
}

/**
 * The little of IndexedDB the kept pressing uses: databases of named stores, each a map,
 * with requests and transactions that settle a moment later. The browser keeps the database
 * across page loads; here, across factories made from the same `disk`.
 */
function fakeIndexedDB(disk = new Map<string, Map<string, Map<IDBValidKey, unknown>>>()) {
  return {
    open(name: string) {
      const fresh = !disk.has(name);
      if (fresh) disk.set(name, new Map());
      const stores = disk.get(name)!;
      const database = {
        createObjectStore: (store: string) => stores.set(store, new Map()),
        close: vi.fn(),
        transaction(store: string) {
          const transaction: { oncomplete?: () => void; objectStore: () => unknown } = {
            objectStore: () => ({
              put: (value: unknown, key: IDBValidKey) => request(() => (stores.get(store)!.set(key, structuredClone(value)), key)),
              get: (key: IDBValidKey) => request(() => stores.get(store)!.get(key)),
            }),
          };
          setTimeout(() => setTimeout(() => transaction.oncomplete?.()));
          return transaction;
        },
      };
      return request(
        () => database,
        (r) => fresh && r.onupgradeneeded?.(),
      );
    },
  } as unknown as IDBFactory;
}

const wav = (text: string) => new Blob([text], { type: 'audio/wav' });

describe('the kept pressing', () => {
  it('is found again after a reload, the last one only', async () => {
    const disk = new Map();
    expect(await keptPressing(fakeIndexedDB(disk))).toBeNull();
    expect(await keepPressing({ title: 'Orbit Terror', wav: wav('RIFF one') }, fakeIndexedDB(disk))).toBe(true);
    expect(await keepPressing({ title: 'Neon Funeral', wav: wav('RIFF two') }, fakeIndexedDB(disk))).toBe(true);
    const kept = await keptPressing(fakeIndexedDB(disk));
    expect(kept?.title).toBe('Neon Funeral');
    expect(await kept?.wav.text()).toBe('RIFF two');
  });

  it('is nothing where the browser keeps nothing, and the page goes on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const blocked = {
      open: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as IDBFactory;
    expect(await keepPressing({ title: 'Orbit Terror', wav: wav('RIFF') }, blocked)).toBe(false);
    expect(await keptPressing(blocked)).toBeNull();
    expect(await keepPressing({ title: 'Orbit Terror', wav: wav('RIFF') }, undefined)).toBe(false);
    expect(await keptPressing(undefined)).toBeNull();
    warn.mockRestore();
  });

  it('is nothing when what is kept is not a pressing', async () => {
    const disk = new Map([['solartournament', new Map([['pressing', new Map<IDBValidKey, unknown>([['last', { title: 'Orbit Terror', wav: 'not a file' }]])]])]]);
    expect(await keptPressing(fakeIndexedDB(disk))).toBeNull();
    disk.get('solartournament')!.get('pressing')!.set('last', { title: '', wav: wav('RIFF') });
    expect(await keptPressing(fakeIndexedDB(disk))).toBeNull();
    disk.get('solartournament')!.get('pressing')!.set('last', 'Orbit Terror');
    expect(await keptPressing(fakeIndexedDB(disk))).toBeNull();
  });
});
