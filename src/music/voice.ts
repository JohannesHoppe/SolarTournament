import type { Voice } from './band';
import { currentLocale, type Locale } from '../i18n/i18n';

const loading = new Map<Locale, Promise<Voice>>();

type Manifest = { sampleRate: number; version: string; clips: Record<string, [number, number]> };

/**
 * Loads the rendered voices for the Host's language: the radio's sprite (the regime's words,
 * the same in every language) and the sprite of the language (the announcer and the flight
 * computer), joined into one, each an MP3 sprite with a manifest of its clips. Loaded once per
 * language and shared by the radio and the flight computer; a failed load is tried again the
 * next time a voice is wanted.
 */
export function loadVoice(locale: Locale = currentLocale()): Promise<Voice> {
  let voice = loading.get(locale);
  if (!voice) {
    voice = Promise.all([load('radio'), load(locale)])
      .then(join)
      .catch((error) => {
        loading.delete(locale);
        throw error;
      });
    loading.set(locale, voice);
  }
  return voice;
}

async function load(sprite: string): Promise<{ buffer: AudioBuffer; manifest: Manifest }> {
  const base = import.meta.env.BASE_URL + 'assets/voice/';
  const fetchOk = async (file: string, init?: RequestInit) => {
    const response = await fetch(base + file, init);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    return response;
  };
  // the manifest is always asked for anew (a cheap revalidation), the sprite under the
  // manifest's fingerprint of it: a cached older sprite can never play a newer manifest's clips
  const manifest = await fetchOk(`voice-${sprite}.json`, { cache: 'no-cache' }).then((r) => r.json() as Promise<Manifest>);
  const audio = await fetchOk(`voice-${sprite}.mp3?v=${manifest.version}`).then((r) => r.arrayBuffer());
  // decoded once at the sprite's own rate (half the memory of 44.1 kHz), usable in the live
  // and in offline contexts alike; playback resamples
  const buffer = await new OfflineAudioContext(1, 1, manifest.sampleRate).decodeAudioData(audio);
  return { buffer, manifest };
}

/** Two sprites as one: the second one's samples after the first's, its clips moved along. */
function join([first, second]: { buffer: AudioBuffer; manifest: Manifest }[]): Voice {
  const buffer = new AudioBuffer({ length: first.buffer.length + second.buffer.length, sampleRate: first.buffer.sampleRate, numberOfChannels: 1 });
  buffer.copyToChannel(first.buffer.getChannelData(0), 0, 0);
  buffer.copyToChannel(second.buffer.getChannelData(0), 0, first.buffer.length);
  const offset = first.buffer.duration;
  const clips = { ...first.manifest.clips };
  for (const [key, [start, length]] of Object.entries(second.manifest.clips)) clips[key] = [start + offset, length];
  return { buffer, clips };
}
