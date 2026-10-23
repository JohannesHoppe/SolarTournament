"""Clones Nicole's lines into a language with Chatterbox Multilingual (see ../README.md).

usage: python clone.py <work folder> <language> [<minutes>]

The work folder holds what prepare.ts wrote (lines.json, reference.wav) and the store of what
was cloned before, as downloaded from the release: nicole-<language>.flac with its index
nicole-<language>.json, and nicole-conds.pt, Nicole's voice as Chatterbox holds it. Lines in
the store are kept as they are; only the missing ones are cloned, each sentence on its own,
checked by ear (Whisper) and cloned again with another seed when it was garbled. Lines the
game no longer says are dropped. After <minutes> (default: no limit) it stops and writes what
it has, so a run cut short by a time limit is taken up by the next.
"""
import difflib, hashlib, json, os, re, sys, time, unicodedata
from pathlib import Path

# no progress bar for every sentence: the log says what was cloned
os.environ['TQDM_DISABLE'] = '1'

import numpy as np
import soundfile as sf
import torch
from huggingface_hub import snapshot_download
from transformers import pipeline
from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals

work, language = Path(sys.argv[1]), sys.argv[2]
deadline = time.time() + float(sys.argv[3]) * 60 if len(sys.argv) > 3 else float('inf')
plan = json.loads((work / 'lines.json').read_text())
clone, check, lines = plan['clone'], plan['check'], plan['locales'][language]

# Tries per sentence: the first take that Whisper hears as the text wins, else the best of them.
TRIES = 4
# How alike Whisper's transcript and the text must be (0..1, letters only) to pass; Whisper
# hears a sentence of a few words less surely, so one shorter than SHORT letters passes lower.
CLEAR, CLEAR_SHORT, SHORT = 0.85, 0.6, 15
# Silence between two sentences of a line (s).
PAUSE = 0.3
# A sentence longer than this per letter, plus a margin, has rambled on past its text (s).
SECONDS_PER_LETTER, MARGIN = 0.12, 2.0
WHISPER = {'de': 'german', 'es': 'spanish', 'fr': 'french'}

store_audio, store_index = work / f'nicole-{language}.flac', work / f'nicole-{language}.json'
conds_path = work / 'nicole-conds.pt'

# the store: every line cloned before, by its key
store: dict[str, np.ndarray] = {}
rate = 24000
if store_index.exists() != store_audio.exists():
    sys.exit(f'{language}: the store is half there ({store_index.name} or {store_audio.name} missing); fetch both again')
if store_index.exists():
    index = json.loads(store_index.read_text())
    # an index cuts only the audio it was written for: one out of step would cut every clip wrong, for good
    if hashlib.sha256(store_audio.read_bytes()).hexdigest() != index['audio']:
        sys.exit(f'{language}: {store_audio.name} is not the audio its index was written for; fetch both again')
    audio, rate = sf.read(store_audio, dtype='float32')
    store = {key: audio[start:start + length] for key, (start, length) in index['clips'].items()}
wanted = {line['key'] for line in lines}
store = {key: clip for key, clip in store.items() if key in wanted}
missing = [line for line in lines if line['key'] not in store]
print(f'{language}: {len(store)} lines in the store, {len(missing)} to clone', flush=True)


def write():
    keys = [line['key'] for line in lines if line['key'] in store]
    clips, offset = {}, 0
    for key in keys:
        clips[key] = [offset, len(store[key])]
        offset += len(store[key])
    audio = np.concatenate([store[key] for key in keys]) if keys else np.zeros(1, dtype=np.float32)
    sf.write(store_audio, audio, rate, subtype='PCM_16')
    # the index names its audio by its fingerprint, and the release keeps the audio under it
    # (see cloneAudioName in nicole.ts): no index ever cuts another audio
    audio_sha = hashlib.sha256(store_audio.read_bytes()).hexdigest()
    store_index.write_text(json.dumps({'sampleRate': rate, 'audio': audio_sha, 'clips': clips}, indent=1) + '\n')
    print(f'{language}: {len(keys)} of {len(lines)} lines in the store', flush=True)


if not missing and conds_path.exists():
    write()
    sys.exit(0)

checkpoint = Path(snapshot_download(repo_id=clone['model'], revision=clone['revision'], allow_patterns=['ve.pt', clone['t3'], 's3gen.pt', 'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json']))
model = ChatterboxMultilingualTTS.from_local(checkpoint, 'cpu', t3_model=clone['t3'])
rate = model.sr
# Nicole's voice: taken once from the English reference and kept, so every later run speaks
# with exactly the same voice
if conds_path.exists():
    model.conds = Conditionals.load(conds_path).to('cpu')
else:
    model.prepare_conditionals(str(work / 'reference.wav'), exaggeration=clone['exaggeration'])
    model.conds.save(conds_path)
# a run that only had to make the voice print is done
if not missing:
    write()
    sys.exit(0)
hear = pipeline('automatic-speech-recognition', model=check['whisper'], revision=check['revision'], device='cpu')


def letters(text: str) -> str:
    text = unicodedata.normalize('NFKD', text.lower())
    return re.sub(r'[^a-z]', '', text)


def clarity(take: np.ndarray, text: str) -> float:
    heard = hear({'raw': take, 'sampling_rate': rate}, generate_kwargs={'language': WHISPER[language], 'task': 'transcribe'})['text']
    match = difflib.SequenceMatcher(None, letters(heard), letters(text))
    # Whisper writes numbers in digits ("2584"), the lines spell them out: with a number heard,
    # what counts is that every letter heard is one of the text's
    if re.search(r'\d', heard):
        return sum(block.size for block in match.get_matching_blocks()) / max(1, len(letters(heard)))
    return match.ratio()


def say(sentence: str, seed: int) -> np.ndarray:
    clear = CLEAR if len(letters(sentence)) >= SHORT else CLEAR_SHORT
    best, best_score = None, -1.0
    for attempt in range(TRIES):
        torch.manual_seed(seed + attempt * 7919)
        take = model.generate(sentence, language_id=language, exaggeration=clone['exaggeration'], cfg_weight=clone['cfg'], temperature=clone['temperature'])[0].numpy()
        rambled = len(take) / rate > len(letters(sentence)) * SECONDS_PER_LETTER + MARGIN
        score = 0.0 if rambled else clarity(take, sentence)
        if score > best_score:
            best, best_score = take, score
        if score >= clear:
            break
    if best_score < clear:
        print(f'  unclear ({best_score:.2f}): {sentence}', flush=True)
    return best


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r'(?<=[.!?…])\s+', text.strip()) if s]


pause = np.zeros(int(PAUSE * rate), dtype=np.float32)
for n, line in enumerate(missing):
    if time.time() > deadline:
        print(f'{language}: out of time', flush=True)
        break
    started = time.time()
    seed = int(line['key'][:8], 16)
    parts = []
    for i, sentence in enumerate(sentences(line['text'])):
        parts += [say(sentence, seed + i * 104729), pause]
    store[line['key']] = np.concatenate(parts[:-1]).astype(np.float32)
    print(f'{language} {n + 1}/{len(missing)} ({time.time() - started:.0f} s): {line["text"][:60]}', flush=True)
    # now and then the store is written, so a run that dies keeps most of its work
    if (n + 1) % 10 == 0:
        write()
write()
