import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from './input';

/** The keyboard part of an Input, without a page: its held keys and its key handler. */
function keyboard() {
  const input = Object.create(Input.prototype) as Input;
  const state = input as unknown as { keys: Set<string>; steering: boolean; handler: () => void; lastPush: { x: number; y: number }; lastTap: object };
  state.keys = new Set();
  state.steering = true;
  state.handler = () => {};
  state.lastPush = { x: 0, y: 0 };
  state.lastTap = { axis: '', sign: 0, at: -Infinity };
  const press = (code: string, down: boolean, metaKey = false) =>
    (input as unknown as { onKey(e: object, down: boolean): void }).onKey({ code, metaKey, repeat: false, isComposing: false, keyCode: 0, target: null, preventDefault() {} }, down);
  return { keys: state.keys, press };
}

describe('the keyboard', () => {
  beforeEach(() => {
    for (const name of ['HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLAnchorElement']) vi.stubGlobal(name, class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lets go of a key released while Command was held, as macOS sends no keyup for it', () => {
    const { keys, press } = keyboard();
    press('KeyW', true);
    press('ShiftLeft', true);
    expect(keys.has('KeyW')).toBe(true);
    // Command down, W let go unseen, Command up
    press('MetaLeft', true, true);
    press('MetaLeft', false, false);
    expect(keys.has('KeyW')).toBe(false);
    expect(keys.has('ShiftLeft')).toBe(true);
  });

  it('does not hold a key pressed together with Command', () => {
    const { keys, press } = keyboard();
    press('KeyS', true, true);
    expect(keys.has('KeyS')).toBe(false);
  });
});
