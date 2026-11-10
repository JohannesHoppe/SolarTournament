/**
 * The kill clip: the picture of the game's canvas and the sound of its audio, recorded in the
 * browser for a few seconds into a short video the Host can share. Nothing leaves the device:
 * the file goes to the device's share sheet, where the Host picks where it goes, or is saved.
 */

/** The video formats tried in turn: MP4 where the browser records it (Safari, recent Chrome), which every network takes, else WebM. */
const TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
/** The clip's frames a second and its video bit rate (bits a second): sharp enough for a phone's feed, a few megabytes for a clip. */
const FPS = 30;
const VIDEO_BITS = 6_000_000;

/** The format this browser records a clip in, or null where it cannot (no MediaRecorder, no canvas stream). */
export function clipType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** The file name of a clip in a format: the extension the format's container has. */
export function clipName(type: string): string {
  return `solartournament-kill.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
}

/**
 * Records `seconds` of the canvas's picture and of whatever `sound` plays into a video in
 * `type` (see clipType). The sound is tapped off beside its way to the speakers, so the Host
 * hears it as before.
 */
export async function recordClip(canvas: HTMLCanvasElement, sound: AudioNode, seconds: number, type: string): Promise<Blob> {
  const context = sound.context as AudioContext;
  const tap = context.createMediaStreamDestination();
  sound.connect(tap);
  const picture = canvas.captureStream(FPS);
  // the capture and the tap end however the recording does: a recorder that refuses its type or
  // fails to start leaves nothing running for the rest of the session
  try {
    const stream = new MediaStream([...picture.getVideoTracks(), ...tap.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: VIDEO_BITS });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    recorder.stop();
    await stopped;
    return new Blob(chunks, { type: recorder.mimeType || type });
  } finally {
    for (const track of [...picture.getTracks(), ...tap.stream.getTracks()]) track.stop();
    sound.disconnect(tap);
  }
}

/**
 * Hands a clip on: to the device's share sheet with a text, where the browser shares files
 * (phones, tablets, Safari), else as a download. Resolves to what happened: shared, saved, or
 * left (the Host closed the share sheet).
 */
export async function passOnClip(clip: Blob, text: string): Promise<'shared' | 'saved' | 'left'> {
  const file = new File([clip], clipName(clip.type), { type: clip.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return 'left';
    }
  }
  const url = URL.createObjectURL(clip);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}
