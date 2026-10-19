import type { Voice } from './band';

let loading: Promise<Voice> | null = null;

/**
 * Loads the rendered words of the voices: one MP3 sprite and a manifest of word positions.
 * Loaded once and shared by the radio and the flight computer; a failed load is tried again
 * the next time a voice is wanted.
 */
export function loadVoice(): Promise<Voice> {
  loading ??= load().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

async function load(): Promise<Voice> {
  const base = import.meta.env.BASE_URL + 'assets/voice/';
  const fetchOk = async (file: string, init?: RequestInit) => {
    const response = await fetch(base + file, init);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    return response;
  };
  // the manifest is always asked for anew (a cheap revalidation), the sprite under the
  // manifest's fingerprint of it: a cached older sprite can never play a newer manifest's clips
  const manifest = await fetchOk('voice.json', { cache: 'no-cache' }).then(
    (r) => r.json() as Promise<{ sampleRate: number; version: string; clips: Record<string, [number, number]> }>,
  );
  const audio = await fetchOk(`voice.mp3?v=${manifest.version}`).then((r) => r.arrayBuffer());
  // decoded once at the sprite's own rate (half the memory of 44.1 kHz), usable in the live
  // and in offline contexts alike; playback resamples
  const buffer = await new OfflineAudioContext(1, 1, manifest.sampleRate).decodeAudioData(audio);
  return { buffer, clips: manifest.clips };
}
