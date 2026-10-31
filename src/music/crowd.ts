/**
 * The crowd of the Presidential Games: the public viewing in the stadiums on Earth, heard
 * through the broadcast (vacuum carries no sound), so it follows Radio 2584's volume, its
 * switch and the muffled link of a lost clone. It is a recording of a roaring crowd
 * (public/assets/sounds/crowd-roar.mp3, CC0), looped, sent through a stadium's overdriven
 * loudspeakers: a soft clip and the narrow band of a broadcast. For an eruption a second layer
 * of it joins, off in time and a little higher, so the crowd sounds twice as big.
 */

const RECORDING = 'assets/sounds/crowd-roar.mp3';
/** The recording loops past the encoder's silence at its start and end (s). */
const LOOP_TRIM = 0.06;
/** How loud the crowd is on its feet (gain into the radio's chain), and the second layer of an eruption. */
const LEVEL = 0.9;
const LAYER_LEVEL = 0.6;
/** The second layer runs this much faster (a crowd that is a little higher) and starts this far into the loop (s). */
const LAYER_RATE = 1.07;
const LAYER_OFFSET = 7.3;
/** The loudspeakers: how hard the soft clip drives, and the band they carry (Hz). */
const DRIVE = 3;
const LOW_CUT = 180;
const HIGH_CUT = 5000;
/** At an eruption the crowd stays on its feet this long (s) before it settles to a murmur of MURMUR. */
const ERUPTION = 4;
const MURMUR = 0.25;
/** Back on air, the murmur returns over this long (s); taken off, the crowd falls silent over HUSH (s). */
const MURMUR_RETURN = 2;
const HUSH = 1.5;
/** At a round's end the crowd stays on its feet this long (s), then fades out over about FINALE_FADE (s), under the results. */
const FINALE = 3;
const FINALE_FADE = 4;
/** After a failed load of the recording, the first new try waits this long (s), each further one twice as long as the last. */
const RETRY = 10;
/** A load that neither completes nor fails is given up after this long (ms), as a failed one. */
const LOAD_TIMEOUT = 30000;

export class Crowd {
  private readonly bed: GainNode;
  private readonly layer: GainNode;
  private recording: AudioBuffer | null = null;
  private loading = false;
  private started = false;
  /** The broadcast shows the stadium (see air). */
  private live = false;
  /** Failed loads of the recording so far, and no new try before this (performance.now(), ms). */
  private failures = 0;
  private retryAt = 0;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.bed = context.createGain();
    this.layer = context.createGain();
    this.bed.gain.value = this.layer.gain.value = 0;
    // the stadium's loudspeakers, pushed into a soft clip, carrying a broadcast's band
    const speakers = context.createWaveShaper();
    speakers.curve = softClip(DRIVE);
    speakers.oversample = '2x';
    const lows = context.createBiquadFilter();
    lows.type = 'highpass';
    lows.frequency.value = LOW_CUT;
    const highs = context.createBiquadFilter();
    highs.type = 'lowpass';
    highs.frequency.value = HIGH_CUT;
    this.bed.connect(speakers);
    this.layer.connect(speakers);
    speakers.connect(lows).connect(highs).connect(destination);
  }

  /**
   * Loads the recording the first time the crowd is wanted, and starts its loops once it is
   * there. After a failed load the next try waits RETRY seconds, twice as long after each
   * further failure, so a missing file is not fetched at every cheer.
   */
  private start() {
    if (this.started || this.loading || performance.now() < this.retryAt) return;
    this.loading = true;
    fetch(new URL(RECORDING, document.baseURI), { signal: AbortSignal.timeout(LOAD_TIMEOUT) })
      .then((answer) => {
        if (!answer.ok) throw new Error(`crowd: ${answer.status}`);
        return answer.arrayBuffer();
      })
      .then((data) => this.context.decodeAudioData(data))
      .then((recording) => {
        this.recording = recording;
        this.started = true;
        this.loop(this.bed, 1, 0);
        this.loop(this.layer, LAYER_RATE, LAYER_OFFSET);
      })
      // no crowd this time: the show goes on without it
      .catch(() => {
        this.loading = false;
        this.retryAt = performance.now() + RETRY * 1000 * 2 ** this.failures;
        this.failures++;
      });
  }

  private loop(into: GainNode, rate: number, offset: number) {
    const source = this.context.createBufferSource();
    source.buffer = this.recording;
    source.loop = true;
    source.loopStart = LOOP_TRIM;
    source.loopEnd = this.recording!.duration - LOOP_TRIM;
    source.playbackRate.value = rate;
    source.connect(into);
    source.start(0, LOOP_TRIM + offset);
  }

  /**
   * Whether the broadcast shows the stadium: while a round is flown and seen. Put on air, the
   * crowd comes back to its murmur; taken off, it hushes. Off air it neither swells nor erupts,
   * so a cheer cued in the round does not wake it under a menu.
   */
  air(on: boolean) {
    if (on === this.live) return;
    this.live = on;
    if (on) this.swell(MURMUR, MURMUR_RETURN);
    else this.hush();
  }

  /**
   * The round is over: the crowd cheers the result, on its feet, and fades out over the
   * results; the broadcast leaves the stadium with it.
   */
  finale() {
    if (!this.live) return;
    this.live = false;
    const now = this.context.currentTime;
    // an eruption's settling to the murmur, still scheduled, would come after the fade-out
    for (const gain of [this.bed, this.layer]) gain.gain.cancelScheduledValues(now);
    this.bed.gain.setTargetAtTime(LEVEL, now, 0.05);
    this.layer.gain.setTargetAtTime(LAYER_LEVEL, now, 0.05);
    for (const gain of [this.bed, this.layer]) gain.gain.setTargetAtTime(0, now + FINALE, FINALE_FADE / 3);
  }

  /**
   * The crowd swells to `level` (0 silent, 1 on its feet) over `seconds`; for `excited` seconds
   * the second layer joins in, as loud as the crowd is above half.
   */
  swell(level: number, seconds: number, excited = 0) {
    if (!this.live) return;
    this.start();
    const now = this.context.currentTime;
    this.bed.gain.setTargetAtTime(level * LEVEL, now, seconds / 3);
    const layer = excited > 0 ? Math.max(0, level - 0.5) * 2 * LAYER_LEVEL : 0;
    this.layer.gain.setTargetAtTime(layer, now, seconds / 3);
    if (excited > 0) this.layer.gain.setTargetAtTime(0, now + excited, excited / 3);
  }

  /** The crowd erupts: on its feet at once, both layers, then settling to a murmur. */
  erupt(seconds = ERUPTION) {
    if (!this.live) return;
    this.start();
    const now = this.context.currentTime;
    this.bed.gain.setTargetAtTime(LEVEL, now, 0.05);
    this.layer.gain.setTargetAtTime(LAYER_LEVEL, now, 0.05);
    this.bed.gain.setTargetAtTime(MURMUR * LEVEL, now + seconds, seconds / 2);
    this.layer.gain.setTargetAtTime(0, now + seconds, seconds / 3);
  }

  /** Quiet: the broadcast cuts away from the stadium (a cheer still fading out is cut short too). */
  hush() {
    this.live = false;
    const now = this.context.currentTime;
    for (const gain of [this.bed, this.layer]) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, HUSH / 3);
    }
  }
}

/** A soft clip (tanh) driven by `drive`, normalized so full scale stays full scale. */
function softClip(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * 4));
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}
