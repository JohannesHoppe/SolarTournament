import { msg, t } from '../i18n/i18n';
import type { Command, Device } from './input';

/**
 * The controls sheet (F1, the pause menu's Controls): the controls of each device, a key or
 * button and what it does. Key letters and gamepad codes are printed on the hardware and stay
 * as they are; every other label is translated where it is shown.
 */
export const SHEET: Record<Device, readonly (readonly [string, string])[]> = {
  keyboard: [
    [msg('Mouse / Arrows'), msg('Turn the nose: push the pointer the way to turn')],
    ['W', msg('Main drive')],
    [msg('Space / Click'), msg('Fire laser')],
    ['S', msg('Brake: press, it flips and burns; press again, back on target')],
    [msg('X (hold)'), msg('Flip: nose against the flight; with the drive it brakes until you let go')],
    ['A / D', msg('Thrusters: slide sideways')],
    ['R / F', msg('Extras: thrusters up and down')],
    [msg('A D R F twice'), msg('Dodge: a hard kick that way')],
    ['Shift', msg('Fine aim')],
    ['T', msg('Autopilot (flies where it points) / free drift')],
    ['E', msg('Overdrive: one shove past the speed limit onto the crosshair, a ram course at whatever lies there')],
    ['G', msg('Torpedo: homes on the ship ahead, a limited load per ship')],
    ['Z', msg('Decoy: a torpedo after you turns to it')],
    [msg('V / Right click'), msg('Hook: bite a rock or a ship and reel in; press again to let go and fly off')],
    [msg('B (hold)'), msg('Self-destruct: takes every rival close by along')],
    ['C', msg('Cockpit / chase camera')],
    ['M', msg('Radio on / off')],
    [', / .', msg('Previous / next song (the game master as DJ)')],
    [msg('Esc / P'), msg('Pause; Q there quits the round')],
    [msg('Tab (hold)'), msg('Standings: kills, deaths, score, in a race the lap')],
    ['F1', msg('This sheet')],
  ],
  gamepad: [
    [msg('Left stick'), msg('Steer (pull back: nose up)')],
    ['RT', msg('Main drive')],
    ['LT / A', msg('Fire laser')],
    ['B', msg('Brake: press, it flips and burns; press again, back on target')],
    [msg('Y (hold)'), msg('Flip: nose against the flight; with the drive it brakes until you let go')],
    [msg('Right stick'), msg('Thrusters: sideways, up and down')],
    ['X', msg('Thrusters: backwards')],
    ['LB', msg('Dodge: a hard kick the way the right stick points')],
    ['L3', msg('Fine aim')],
    ['R3', msg('Autopilot (flies where it points) / free drift')],
    ['RB', msg('Overdrive: one shove past the speed limit onto the crosshair, a ram course at whatever lies there')],
    [msg('D-pad up'), msg('Torpedo: homes on the ship ahead, a limited load per ship')],
    [msg('D-pad right'), msg('Decoy: a torpedo after you turns to it')],
    [msg('D-pad down'), msg('Hook: bite a rock or a ship and reel in; press again to let go and fly off')],
    [msg('D-pad left (hold)'), msg('Self-destruct: takes every rival close by along')],
    [msg('View'), msg('Cockpit / chase camera')],
    [msg('Menu'), msg('Pause')],
    [msg('D-pad down (paused)'), msg('Radio on / off')],
    [msg('D-pad left / right (paused)'), msg('Previous / next song (the game master as DJ)')],
  ],
  touch: [
    [msg('Left stick'), msg('Steer (drag up: nose up)')],
    [msg('Right stick'), msg('Appears under your right thumb and fires the thrusters; two quick flicks dodge')],
    [msg('Drive'), msg('Hold for the main drive')],
    [msg('Fire'), msg('Hold to fire the laser')],
    [msg('Brake'), msg('Tap: brakes; tap again: back on target')],
    [msg('Flip'), msg('Hold: nose against the flight; with Drive it brakes until you let go')],
    [msg('Hook'), msg('Tap: fire the hook and reel in; tap again to let go')],
    [msg('Auto'), msg('Autopilot / free drift')],
    [msg('Overdrive'), msg('One shove forward, last resort')],
    [msg('Torpedo'), msg('Launch a torpedo')],
    [msg('Decoy'), msg('Drop a decoy')],
    [msg('Self-destruct'), msg('Hold: takes every rival close by along')],
  ],
};

/** The devices in the order of the sheet's tabs, with their names. */
export const SHEET_TABS: readonly (readonly [Device, string])[] = [
  ['keyboard', msg('Keyboard and mouse')],
  ['gamepad', msg('Gamepad')],
  ['touch', msg('Touch screen')],
];

/** The rows that need something a ship may lack (bought gear, or what the campaign's hull is not fitted with yet), by what they do. */
const NEEDS: Partial<Record<string, Command>> = {
  'Fire laser': 'fire',
  'Hold to fire the laser': 'fire',
  'Dodge: a hard kick that way': 'dodge',
  'Dodge: a hard kick the way the right stick points': 'dodge',
  'Overdrive: one shove past the speed limit onto the crosshair, a ram course at whatever lies there': 'overdrive',
  'One shove forward, last resort': 'overdrive',
  'Torpedo: homes on the ship ahead, a limited load per ship': 'torpedo',
  'Launch a torpedo': 'torpedo',
  'Hook: bite a rock or a ship and reel in; press again to let go and fly off': 'hook',
  'Tap: fire the hook and reel in; tap again to let go': 'hook',
  'Self-destruct: takes every rival close by along': 'selfDestruct',
  'Hold: takes every rival close by along': 'selfDestruct',
};

/**
 * Fills a list with a device's controls, in the Host's language; what the ship lacks (`lacking`)
 * stays on the list, grey and struck through, so the key is known before it does anything.
 */
export function fillSheet(list: HTMLElement, device: Device, lacking: ReadonlySet<Command> = new Set()) {
  list.replaceChildren(
    ...SHEET[device].flatMap(([keys, text]) => {
      const dt = document.createElement('dt');
      dt.textContent = t(keys);
      const dd = document.createElement('dd');
      dd.textContent = t(text);
      const need = NEEDS[text];
      if (need && lacking.has(need)) {
        for (const cell of [dt, dd]) {
          cell.classList.add('lacking');
          cell.title = t('Not on your ship yet');
        }
      }
      return [dt, dd];
    }),
  );
}
