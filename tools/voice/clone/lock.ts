/**
 * Finishes requirements.txt after pip-compile (see ../README.md, "The Python lock"): torch and
 * torchaudio become the CPU builds for CPython 3.11 on Linux x86-64 from PyTorch's own index,
 * named by their URL and hash (the runner has no GPU, and the CUDA builds on PyPI are gigabytes
 * larger), and Chatterbox is added as the archive of the commit in CLONE.code, with its hash, to
 * be installed without its dependencies (they are the rest of the file).
 *
 * usage: node tools/voice/clone/lock.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLONE } from '../nicole.ts';

const file = join(dirname(fileURLToPath(import.meta.url)), 'requirements.txt');
let lock = readFileSync(file, 'utf8');

/** A package's block as pip-compile writes it: the pin, its hashes, the comments saying why. */
const block = (name: string) => new RegExp(`^${name}(==| @ )\\S+(?: \\\\\\n {4}--hash=sha256:[0-9a-f]+)+\\n((?: {4}#.*\\n)*)`, 'm');

for (const name of ['torch', 'torchaudio']) {
  const pin = new RegExp(`^${name}==([0-9.]+)`, 'm').exec(lock);
  if (!pin) throw new Error(`requirements.txt pins no ${name}==<version>: run this right after pip-compile`);
  const index = await (await fetch(`https://download.pytorch.org/whl/cpu/${name}/`)).text();
  const wheel = new RegExp(`href="(https://[^"#]+/${name}-${pin[1].replaceAll('.', '\\.')}%2Bcpu-cp311-cp311-(?:manylinux_2_28_x86_64|linux_x86_64)\\.whl)#sha256=([0-9a-f]{64})"`).exec(index);
  if (!wheel) throw new Error(`no CPU wheel of ${name} ${pin[1]} for CPython 3.11 on Linux x86-64 in PyTorch's index`);
  lock = lock.replace(block(name), (_, _pin, comments: string) => `${name} @ ${wheel[1]} \\\n    --hash=sha256:${wheel[2]}\n${comments}`);
}

const commit = /@([0-9a-f]{40})$/.exec(CLONE.code)?.[1];
if (!commit) throw new Error('CLONE.code names no commit');
const url = `https://github.com/resemble-ai/chatterbox/archive/${commit}.tar.gz`;
const answer = await fetch(url);
if (!answer.ok) throw new Error(`${url}: HTTP ${answer.status}`);
const hash = createHash('sha256').update(Buffer.from(await answer.arrayBuffer())).digest('hex');
lock = lock.replace(block('chatterbox-tts'), '');
lock += `chatterbox-tts @ ${url} \\\n    --hash=sha256:${hash}\n    # CLONE.code in tools/voice/nicole.ts, installed without its dependencies\n`;
writeFileSync(file, lock);
console.log(`requirements.txt: torch and torchaudio for the CPU, Chatterbox at ${commit.slice(0, 7)}`);
