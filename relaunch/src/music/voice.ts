import type { Voice } from './band';

/** Loads the rendered words of the voices: one MP3 sprite and a manifest of word positions. */
export async function loadVoice(): Promise<Voice> {
  const base = import.meta.env.BASE_URL + 'assets/voice/';
  const [manifest, audio] = await Promise.all([
    fetch(base + 'voice.json').then((r) => r.json() as Promise<{ clips: Record<string, [number, number]> }>),
    fetch(base + 'voice.mp3').then((r) => r.arrayBuffer()),
  ]);
  // decoded once, usable in the live and in offline contexts alike
  const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(audio);
  return { buffer, clips: manifest.clips };
}
