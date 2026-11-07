"""Clones every speaker's lines into a language with Chatterbox Multilingual (see ../README.md):
Nicole's and the campaign's people's (SPEAKERS in ../nicole.ts).

usage: python clone.py <work folder> <language> [<minutes>]

The work folder holds what prepare.ts wrote (lines.json, the English references) and the stores
of what was cloned before, as downloaded from the release: for each speaker <store>.flac with its
index <store>.json (nicole-de, rask-de, …), and <speaker>-conds.pt, the speaker's voice as
Chatterbox holds it. Lines in a store are kept as they are; only the missing ones are cloned,
each sentence on its own, checked by ear (Whisper) and cloned again with another seed when it was
garbled. Lines the game no longer says are dropped. A speaker without a voice print gets one in
the German job; the other languages leave that speaker for the next run. After <minutes>
(default: no limit) it stops and writes what it has, so a run cut short by a time limit is taken
up by the next.
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
clone, check = plan['clone'], plan['check']

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

# the model and the ear, loaded once, when a speaker first needs them
model = None
hear = None


def load_model():
    global model
    if model is None:
        checkpoint = Path(snapshot_download(repo_id=clone['model'], revision=clone['revision'], allow_patterns=['ve.pt', clone['t3'], 's3gen.pt', 'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json']))
        model = ChatterboxMultilingualTTS.from_local(checkpoint, 'cpu', t3_model=clone['t3'])
    return model


def load_ear():
    global hear
    if hear is None:
        hear = pipeline('automatic-speech-recognition', model=check['whisper'], revision=check['revision'], device='cpu')
    return hear


def letters(text: str) -> str:
    text = unicodedata.normalize('NFKD', text.lower())
    return re.sub(r'[^a-z]', '', text)


def clarity(take: np.ndarray, text: str, rate: int) -> float:
    heard = load_ear()({'raw': take, 'sampling_rate': rate}, generate_kwargs={'language': WHISPER[language], 'task': 'transcribe'})['text']
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
        try:
            take = model.generate(sentence, language_id=language, exaggeration=clone['exaggeration'], cfg_weight=clone['cfg'], temperature=clone['temperature'])[0].numpy()
        except IndexError:
            # now and then the sampling runs past the speech tokens (Chatterbox: "out-of-range
            # special tokens found in flow") and the decoder fails: a take that failed, and the
            # next seed tries again
            print(f'  failed take {attempt + 1}: {sentence}', flush=True)
            continue
        rambled = len(take) / model.sr > len(letters(sentence)) * SECONDS_PER_LETTER + MARGIN
        score = 0.0 if rambled else clarity(take, sentence, model.sr)
        if score > best_score:
            best, best_score = take, score
        if score >= clear:
            break
    if best is None:
        raise RuntimeError(f'every take failed: {sentence}')
    if best_score < clear:
        print(f'  unclear ({best_score:.2f}): {sentence}', flush=True)
    return best


# A sentence of fewer words than this is spoken together with the one after it (or before it, at
# a line's end): one word alone ("Erster.") runs Chatterbox's sampling off its speech tokens.
FEWEST_WORDS = 2


def sentences(text: str) -> list[str]:
    split = [s for s in re.split(r'(?<=[.!?…])\s+', text.strip()) if s]
    joined: list[str] = []
    for sentence in split:
        if joined and len(joined[-1].split()) < FEWEST_WORDS:
            joined[-1] += ' ' + sentence
        else:
            joined.append(sentence)
    if len(joined) > 1 and len(joined[-1].split()) < FEWEST_WORDS:
        last = joined.pop()
        joined[-1] += ' ' + last
    return joined


def clone_speaker(speaker: str, spec: dict) -> bool:
    """Clones what a speaker's store of the language lacks; False once the time is up."""
    conds_path = work / spec['conds']
    if not conds_path.exists() and language != 'de':
        print(f'{speaker} {language}: no voice print yet, left for the German job', flush=True)
        return True
    store_name = spec['locales'][language]['store']
    lines = spec['locales'][language]['lines']
    store_audio, store_index = work / f'{store_name}.flac', work / f'{store_name}.json'

    # the store: every line cloned before, by its key
    store: dict[str, np.ndarray] = {}
    rate = 24000
    if store_index.exists() != store_audio.exists():
        sys.exit(f'{store_name}: the store is half there ({store_index.name} or {store_audio.name} missing); fetch both again')
    if store_index.exists():
        index = json.loads(store_index.read_text())
        # an index cuts only the audio it was written for: one out of step would cut every clip wrong, for good
        if hashlib.sha256(store_audio.read_bytes()).hexdigest() != index['audio']:
            sys.exit(f'{store_name}: {store_audio.name} is not the audio its index was written for; fetch both again')
        audio, rate = sf.read(store_audio, dtype='float32')
        store = {key: audio[start:start + length] for key, (start, length) in index['clips'].items()}
    wanted = {line['key'] for line in lines}
    store = {key: clip for key, clip in store.items() if key in wanted}
    missing = [line for line in lines if line['key'] not in store]
    print(f'{store_name}: {len(store)} lines in the store, {len(missing)} to clone', flush=True)

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
        print(f'{store_name}: {len(keys)} of {len(lines)} lines in the store', flush=True)

    if not missing and conds_path.exists():
        write()
        return True
    load_model()
    rate = model.sr
    # the speaker's voice: taken once from the English reference and kept, so every later run
    # speaks with exactly the same voice
    if conds_path.exists():
        model.conds = Conditionals.load(conds_path).to('cpu')
    else:
        model.prepare_conditionals(str(work / spec['reference']), exaggeration=clone['exaggeration'])
        model.conds.save(conds_path)
    pause = np.zeros(int(PAUSE * rate), dtype=np.float32)
    for n, line in enumerate(missing):
        if time.time() > deadline:
            print(f'{store_name}: out of time', flush=True)
            write()
            return False
        started = time.time()
        seed = int(line['key'][:8], 16)
        parts = []
        for i, sentence in enumerate(sentences(line['text'])):
            parts += [say(sentence, seed + i * 104729), pause]
        store[line['key']] = np.concatenate(parts[:-1]).astype(np.float32)
        print(f'{store_name} {n + 1}/{len(missing)} ({time.time() - started:.0f} s): {line["text"][:60]}', flush=True)
        # now and then the store is written, so a run that dies keeps most of its work
        if (n + 1) % 10 == 0:
            write()
    write()
    return True


for speaker, spec in plan['speakers'].items():
    if not clone_speaker(speaker, spec):
        break
