import type { Controls } from './input/input';

/**
 * The input recorder: the own ship's flight step by step, what the Host's hand did and what the
 * flight computer made of it, so a flight that feels wrong can be saved, read and replayed in a
 * test (see replay in src/test/cockpit.ts). It exists only in development, like the dev log; in production
 * `recorder` is null and every call site (`recorder?.…`) costs nothing. A ring buffer of the last
 * RECORDER_CAPACITY steps, cleared at the start of every round; in the console:
 * `game.recorder.download()` saves the last minute as JSON.
 */

/** What the flight computer flew in a step. */
export type FlightMode = 'autopilot' | 'free' | 'brake' | 'flip' | 'swing' | 'dead';

type Vec3 = [number, number, number];

/** One step of the own ship: the state before it, the Host's input, and the commands flown. */
export interface InputFrame {
  /** Game time (s) and the step's length (s). */
  t: number;
  dt: number;
  mode: FlightMode;
  /** The Host's controls as read from keyboard, mouse, gamepad or touch. */
  controls: Controls;
  /** The mouse pointer's offset from the screen center, in full deflections (x right, y up), null without a mouse in flight. */
  pointer: [number, number] | null;
  /** The commands the flight computer gave the ship. */
  out: Controls;
  /** Gravity at the ship (units/s²). */
  gravity: Vec3;
  /** The ship before the step: position, velocity (units, units/s), orientation (quaternion x, y, z, w). */
  position: Vec3;
  velocity: Vec3;
  orientation: [number, number, number, number];
  /** Drive and thrusters, 0..1. */
  drive: number;
  thrusters: number;
}

/** A saved flight. */
export interface Recording {
  version: 1;
  frames: InputFrame[];
}

/** Steps kept: a minute at 60 frames a second. */
const RECORDER_CAPACITY = 3600;

export class InputRecorder {
  private readonly buffer: InputFrame[] = [];
  private next = 0;

  /** A new round: an empty recording. */
  clear() {
    this.buffer.length = 0;
    this.next = 0;
  }

  add(frame: InputFrame) {
    if (this.buffer.length < RECORDER_CAPACITY) this.buffer.push(frame);
    else this.buffer[this.next] = frame;
    this.next = (this.next + 1) % RECORDER_CAPACITY;
  }

  /** The steps kept, oldest first. */
  frames(): InputFrame[] {
    return this.buffer.length < RECORDER_CAPACITY ? this.buffer.slice() : [...this.buffer.slice(this.next), ...this.buffer.slice(0, this.next)];
  }

  /** The last `seconds` of the flight (all of it by default) as a recording. */
  recording(seconds = Infinity): Recording {
    const frames = this.frames();
    const from = (frames.at(-1)?.t ?? 0) - seconds;
    return { version: 1, frames: frames.filter((frame) => frame.t >= from) };
  }

  /** The recording as JSON. */
  json(seconds?: number): string {
    return JSON.stringify(this.recording(seconds));
  }

  /** Saves the recording as a JSON file (in the browser). */
  download(seconds?: number) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([this.json(seconds)], { type: 'application/json' }));
    link.download = `flight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

/** The recorder in development, null in production. */
export const recorder: InputRecorder | null = import.meta.env.DEV ? new InputRecorder() : null;
