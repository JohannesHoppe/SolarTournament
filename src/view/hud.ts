import * as THREE from 'three';
import { MAX_HEAT, MAX_HULL, type Ship } from '../ship/ship';
import { CONTROLS, keyLabel, type Command, type Device } from '../input/input';
import { markedName, swatch, type Kind } from './marks';
import { shownTint } from '../ship/tints';
import { ink } from './ink';
import { msg, t } from '../i18n/i18n';
import { Attitude } from './attitude';
import { WELL_GAUGE, WELL_LOST, wellLevel, type Alarm, type AlarmLevel } from '../game/alarms';

/** The master caution above the alarm list names the worst level. */
const MASTER: Record<AlarmLevel, string> = { caution: msg('CAUTION'), warning: msg('WARNING'), critical: msg('CRITICAL') };
const LEVELS: readonly AlarmLevel[] = ['caution', 'warning', 'critical'];
/** Lines of the alarm list; more alarms at once are left out, the mildest first. */
const ALARM_ROWS = 4;
/** Degrees a direction arrow turns in steps of, so a small drift does not rewrite its style. */
const ARROW_STEP = 5;
const unturn = new THREE.Quaternion();
const toward = new THREE.Vector3();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const projected = new THREE.Vector3();
const rim = new THREE.Vector3();
const cameraUp = new THREE.Vector3();
/** A ring is bracketed while its opening spans this many pixels on screen, up to this share of the screen's height (closer, it fills the view by itself). */
const GATE_MARK_MIN = 18;
const GATE_MARK_MAX = 1.4;
/** Kills stay in the feed this long (s). */
const KILLFEED_SECONDS = 5;
/** A big moment's banner stands this long (s), as long as its animation in style.css. */
const BANNER_SECONDS = 2.4;
/** A ship's name needs about this much room beside its mark (px); a name closer to one already written is left out. */
const LABEL_WIDTH = 140;
const LABEL_HEIGHT = 18;
/** A name in the picture starts this far right of its ship (px, `.marker`'s margin and padding in style.css). */
const NAME_LEFT = 20;
/** A ship off screen gets its arrow where the view's edge cuts the line to it, this share of the half width and height out from the middle. */
const EDGE_X = 0.95;
const EDGE_Y = 0.8;
/** The size of a ship's name beside its arrow at the screen's edge (font and line, px) and its widest box, longer names cut short; smaller on a phone. */
type TagSize = { size: number; line: number; max: number };
const TAG: TagSize = { size: 12, line: 16, max: 150 };
const TAG_PHONE: TagSize = { size: 10, line: 13, max: 84 };
/** A name keeps this far from its arrow's point and this far from the screen's edge (px); its plate pads it by TAG_PADDING on each side. */
const TAG_GAP = 16;
const TAG_MARGIN = 4;
const TAG_PADDING = 3;
/** Where its first place is taken, a name tries this many steps along the edge each way before it is left out. */
const TAG_TRIES = 3;
/** The mark before a name takes this much room (em, see `.mark` in style.css). */
const MARK_EM = 1.25;
/** An arrow at the edge reaches this far from its point (px); no name covers it. */
const ARROW_REACH = 12;
/** The HUD's pieces the names at the edge keep clear of (the pieces the layout test keeps apart), measured anew this often (ms). */
const OBSTACLES = '.hud-top, #hud-room, #school-panel, #hud-split, #hud-alerts > *, #transmission, #radar, .hud-bottom, #killfeed, #now-playing, .touch-button';
const OBSTACLE_MS = 500;
/** How long a fresh clone's projection takes to draw itself (s); style.css staggers its pieces within it. */
const BOOT_SECONDS = 1.2;
/** Display scale: one world unit is 5 cm, a ship is about 35 m long. */
export const METERS_PER_UNIT = 0.05;
/** The size of the window, as Game.resize last set it: reading it from the window after the HUD wrote to the page would force a layout. */
const viewport = { width: window.innerWidth, height: window.innerHeight };

export class Hud {
  private readonly root = $('hud');
  private readonly time = $('hud-time');
  private readonly score = $('hud-score');
  private readonly hull = $('hud-hull');
  private readonly drive = $('hud-drive');
  private readonly thrusters = $('hud-thrusters');
  private readonly heat = $('hud-heat');
  private readonly shadow = $('hud-shadow');
  private readonly warning = $('hud-warning');
  private readonly master = $('hud-master');
  private readonly alarmRows: { row: HTMLElement; arrow: HTMLElement; text: HTMLElement; angle: number }[] = [];
  private readonly escape = $('hud-escape');
  private readonly escapeFill = this.escape.querySelector('b') as HTMLElement;
  private readonly escapeValue = $('hud-escape-value');
  private escapeShown = -1;
  private readonly lock = $('hud-lock');
  private readonly vignette = $('g-vignette');
  private readonly flareHeat = $('flare-heat');
  private readonly speed = $('hud-speed');
  private readonly mode = $('hud-mode');
  private readonly overdrive = $('hud-overdrive');
  private readonly hook = $('hud-hook');
  private readonly torpedo = $('hud-torpedo');
  private readonly prograde = $('prograde');
  private readonly retrograde = $('retrograde');
  private readonly message = $('hud-message');
  private readonly countdownText = $('hud-countdown');
  private readonly startFlash = $('start-flash');
  private readonly startLights = $('start-lights');
  private readonly introCard = $('intro-card');
  private readonly splitText = $('hud-split');
  private splitUntil = 0;
  private readonly hitmarker = $('hitmarker');
  private readonly damageFlash = $('damage-flash');
  private readonly killfeed = $('killfeed');
  private readonly schoolPanel = $('school-panel');
  private readonly schoolStep = $('school-step');
  private readonly schoolText = $('school-text');
  private readonly schoolKeys = $('school-keys');
  private readonly waypoint = $('waypoint');
  private readonly crosshair = $('crosshair');
  private readonly waypointLabel = $('waypoint-label');
  private readonly center = $('center');
  private readonly centerDistance = $('center-distance');
  private readonly markers = new Map<string, Marker>();
  /** Ships marked this frame, reused from frame to frame. */
  private readonly seen = new Set<string>();
  /** Where the names written this frame sit (x, y pairs, px), reused from frame to frame. */
  private readonly labeled: number[] = [];
  private readonly labeledMarkers: Marker[] = [];
  /** The arrows at the screen's edge this frame, and the records they are kept in, reused from frame to frame. */
  private readonly edges: Edge[] = [];
  private readonly edgePool: Edge[] = [];
  /** What the names at the edge keep clear of this frame, and the HUD's pieces among it (boxes, flat: left, top, right, bottom). */
  private readonly blocked: number[] = [];
  private readonly obstacles: number[] = [];
  private obstaclesAt = 0;
  private measure: CanvasRenderingContext2D | null = null;
  private readonly markerLayer = document.createElement('div');
  private readonly attitude = new Attitude($<HTMLCanvasElement>('hud-attitude'));
  private messageUntil = 0;
  /** The projection boots until then (see boot); -1 when it stands. */
  private bootUntil = -1;
  private hitmarkerTimer = 0;
  private flashTimer = 0;
  /** The keys shown before the readouts at the bottom, and the device they are shown for. */
  private readonly keys = [...document.querySelectorAll<HTMLElement>('.hud-key')];
  private keysFor: Device | null = null;

  constructor() {
    this.markerLayer.className = 'markers';
    this.root.prepend(this.markerLayer);
    for (let i = 0; i < ALARM_ROWS; i++) {
      const row = document.createElement('div');
      row.className = 'alarm';
      row.hidden = true;
      const arrow = document.createElement('i');
      arrow.className = 'alarm-arrow';
      const text = document.createElement('span');
      row.append(arrow, text);
      this.warning.append(row);
      this.alarmRows.push({ row, arrow, text, angle: NaN });
    }
  }

  /**
   * The key of each readout at the bottom (autopilot, overdrive, hook, torpedo) for the device
   * the Host flies with, so it need not be remembered in a panic; on a touch screen the buttons
   * name themselves.
   */
  setKeys(device: Device) {
    if (device === this.keysFor) return;
    this.keysFor = device;
    for (const key of this.keys) {
      const label = device === 'touch' ? '' : t(CONTROLS[device][key.dataset.command as Command]?.[0] ?? '');
      key.textContent = device === 'keyboard' ? keyLabel(label) : label;
      key.hidden = !label;
    }
  }

  show(visible: boolean) {
    this.root.hidden = !visible;
    // a hidden HUD cancels the popups' animation without ending it: they would replay later
    if (!visible) this.clearPopups();
  }

  /** The window's new size (see viewport). */
  setViewport(width: number, height: number) {
    viewport.width = width;
    viewport.height = height;
    this.attitude.setViewport(width, height, Math.min(window.devicePixelRatio, 2));
  }

  /** The horizon, the pitch ladder and the heading tape (see Attitude), while a clone flies; a phone leaves out the tape. */
  updateAttitude(camera: THREE.Camera, show: boolean, phone: boolean) {
    this.attitude.update(camera, show, !phone);
  }

  /** The crosshair shows while the own clone flies. */
  showCrosshair(visible: boolean) {
    setHidden(this.crosshair, !visible);
    setHidden(this.hitmarker, !visible);
  }

  private clearPopups() {
    for (const popup of this.root.querySelectorAll('.popup')) popup.remove();
  }

  reset() {
    this.killfeed.replaceChildren();
    this.clearPopups();
    this.setLock('', null);
    this.markerLayer.replaceChildren();
    this.markers.clear();
    this.message.textContent = '';
    this.countdownText.textContent = '';
    this.bannerText.textContent = '';
    this.bannerUntil = -Infinity;
    this.startLights.hidden = true;
    this.hideIntro();
    this.splitText.textContent = '';
    this.setSchool(null);
    this.waypoint.hidden = true;
    this.center.hidden = true;
  }

  /**
   * A fresh clone's link comes up: the projection draws itself piece by piece over BOOT_SECONDS
   * (see #hud.booting in style.css), then says the link stands.
   */
  boot(now: number) {
    this.root.classList.remove('booting');
    // a reflow between removing and adding the class restarts the animation
    void this.root.offsetWidth;
    this.root.classList.add('booting');
    this.bootUntil = now + BOOT_SECONDS;
  }

  /** secondsLeft is Infinity in rounds without a time limit. */
  update(now: number, secondsLeft: number, me: Ship) {
    if (this.bootUntil >= 0 && now >= this.bootUntil) {
      this.bootUntil = -1;
      this.root.classList.remove('booting');
      if (me.alive) this.flashMessage(now, t('LINK ESTABLISHED'), 1.5);
    }
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = Math.floor(secondsLeft % 60);
    setText(this.time, Number.isFinite(secondsLeft) ? `${minutes}:${String(seconds).padStart(2, '0')}` : '');
    setText(this.score, t('{n} pts', { n: me.score }));
    setBar(this.hull, me.hull / MAX_HULL);
    setBar(this.drive, me.drive);
    setBar(this.thrusters, me.thrusters);
    this.heat.style.width = `${Math.min(1, me.heat / MAX_HEAT) * 100}%`;
    this.heat.classList.toggle('overheated', me.overheated);
    setHidden(this.shadow, !me.alive || !me.inShadow);
    // at the tournament's speed limit the readout says so: the drive is held back
    const speed = Math.round(me.flight.velocity.length() * METERS_PER_UNIT);
    setText(this.speed, me.flight.limited ? t('{speed} m/s · MAX', { speed }) : t('{speed} m/s', { speed }));

    if (!me.alive) setText(this.message, t('Live link lost'));
    else if (now > this.messageUntil) setText(this.message, '');
    if (now > this.splitUntil) setText(this.splitText, '');

    // the newest entries come first: expired ones are at the end
    let item = this.killfeed.lastElementChild as HTMLElement | null;
    while (item && now - Number(item.dataset.at) > KILLFEED_SECONDS) {
      const previous = item.previousElementSibling as HTMLElement | null;
      item.remove();
      item = previous;
    }
  }

  /** Flight school instruction; null hides the panel. Keys of the keyboard are named as the Host's layout prints them, gamepad buttons as they are. */
  setSchool(status: { step: string; text: string; keys: string[] } | null, keyboard = true) {
    this.schoolPanel.hidden = !status;
    if (!status) return;
    setText(this.schoolStep, status.step);
    setText(this.schoolText, status.text);
    const keys = `${keyboard}|${status.keys.join('|')}`;
    if (this.schoolKeys.dataset.keys !== keys) {
      this.schoolKeys.dataset.keys = keys;
      this.schoolKeys.replaceChildren(...status.keys.map((key) => Object.assign(document.createElement('kbd'), { textContent: keyboard ? keyLabel(key) : key })));
    }
  }

  /** A short word or number floating up from a point in space: a hit, a kill, points. */
  popup(camera: THREE.Camera, point: THREE.Vector3, text: string, kind: 'hit' | 'armor' | 'kill' | 'points') {
    projected.copy(point).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return;
    const popup = document.createElement('div');
    popup.className = `popup ${kind}`;
    popup.textContent = text;
    popup.style.translate = `${((projected.x + 1) / 2) * viewport.width}px ${((1 - projected.y) / 2) * viewport.height}px`;
    popup.addEventListener('animationend', () => popup.remove());
    this.root.append(popup);
  }

  /** The crosshair glows orange while the laser would hit a drive, and dims over armor, where a shot does little. */
  setOnTarget(hit: 'drive' | 'armor' | null) {
    setClass(this.crosshair, 'on-target', hit === 'drive');
    setClass(this.crosshair, 'on-armor', hit === 'armor');
  }

  /** The crosshair and the hit marker sit where the nose points (see Game.aimCrosshair). */
  setCrosshair(camera: THREE.Camera, point: THREE.Vector3) {
    pin(this.crosshair, camera, point);
    pin(this.hitmarker, camera, point);
  }

  /** Blinking diamond on a point in space with what it is, clamped to the screen edge when off screen. */
  /**
   * The flight computer brackets the next ring of a course on screen, sized to its opening of
   * `radius` (units), with a reticle on its core, and the ring after it faintly (see
   * .gate-mark); a ring behind, off screen, too far to see or filling the view goes unmarked.
   * `crossing` is where the flight passes the next ring's plane, `inside` whether that lies
   * inside the ring (see markCrossing).
   */
  setGates(camera: THREE.Camera, next: THREE.Vector3 | null, after: THREE.Vector3 | null, radius: number, crossing: THREE.Vector3 | null = null, inside = false) {
    this.markGate(this.gateNext, camera, next, radius);
    this.markGate(this.gateAfter, camera, after, radius);
    this.markCrossing(camera, next && crossing, inside);
  }

  private readonly crossing = $('gate-cross');

  /**
   * The crossing mark: where the flight, held as it is, passes the next ring's plane (see
   * pathCrossing). In the flight computer's azure while that lies inside the ring, in orange
   * while it lies outside: the pilot steers the mark into the ring. Hidden off screen.
   */
  private markCrossing(camera: THREE.Camera, point: THREE.Vector3 | null, inside: boolean) {
    if (point) projected.copy(point).project(camera);
    const shown = !!point && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
    setHidden(this.crossing, !shown);
    if (!shown) return;
    setClass(this.crossing, 'outside', !inside);
    this.crossing.style.translate = `${Math.round(((projected.x + 1) / 2) * viewport.width)}px ${Math.round(((1 - projected.y) / 2) * viewport.height)}px`;
  }

  private readonly gateNext = { element: $('gate-mark'), x: NaN, y: NaN, size: NaN };
  private readonly gateAfter = { element: $('gate-mark-after'), x: NaN, y: NaN, size: NaN };

  private markGate(mark: { element: HTMLElement; x: number; y: number; size: number }, camera: THREE.Camera, point: THREE.Vector3 | null, radius: number) {
    let size = 0;
    if (point) {
      projected.copy(point).project(camera);
      cameraUp.setFromMatrixColumn(camera.matrixWorld, 1);
      rim.copy(point).addScaledVector(cameraUp, radius).project(camera);
      if (projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1) size = Math.abs(rim.y - projected.y) * viewport.height;
    }
    const shown = size >= GATE_MARK_MIN && size <= viewport.height * GATE_MARK_MAX;
    setHidden(mark.element, !shown);
    if (!shown) return;
    const x = Math.round(((projected.x + 1) / 2) * viewport.width);
    const y = Math.round(((1 - projected.y) / 2) * viewport.height);
    const rounded = Math.round(size);
    if (x !== mark.x || y !== mark.y) {
      mark.element.style.translate = `${x}px ${y}px`;
      mark.x = x;
      mark.y = y;
    }
    if (rounded !== mark.size) {
      mark.element.style.setProperty('--size', `${rounded}px`);
      mark.size = rounded;
    }
  }

  setWaypoint(camera: THREE.Camera, point: THREE.Vector3 | null, label = '') {
    setHidden(this.waypoint, !point);
    if (!point) return;
    setText(this.waypointLabel, label);
    pin(this.waypoint, camera, point);
  }

  /** The overdrive next to the flight mode: ready, or the seconds until it is. */
  setOverdrive(seconds: number) {
    setText(this.overdrive, seconds > 0 ? t('Overdrive {s} s', { s: Math.ceil(seconds) }) : t('Overdrive ready'));
    setClass(this.overdrive, 'ready', seconds <= 0);
  }

  /** The hook: holding with so much cable out (m), recharging for `seconds`, or ready. */
  setHook(cable: number | null, seconds: number) {
    setText(this.hook, cable !== null ? t('Hooked · {m} m', { m: Math.round(cable) }) : seconds > 0 ? t('Hook {s} s', { s: seconds.toFixed(1) }) : t('Hook ready'));
    const state = cable !== null ? 'held' : seconds > 0 ? '' : 'ready';
    if (this.hook.className !== `readout ${state}`.trim()) this.hook.className = `readout ${state}`.trim();
  }

  /** The torpedoes left and the items held, each with what it does, next to the overdrive. */
  setArsenal(torpedoes: number, twin: boolean, plating: number, nova: boolean) {
    // each item is a phrase of its own, joined by the separator
    const items = `${twin ? ` · ${t('Twin: fires twice as fast')}` : ''}${plating ? ` · ${t('Plating {n}: stops hits', { n: plating })}` : ''}${nova ? ` · ${t('Nova: next shot blows up everything around')}` : ''}`;
    setText(this.torpedo, `${torpedoes > 0 ? t('Torpedo {n}', { n: torpedoes }) : t('No torpedo')}${items}`);
    setClass(this.torpedo, 'ready', torpedoes > 0);
  }

  /** The flight mode next to the velocity: AUTOPILOT in blue, FREE DRIFT in orange. */
  setAutopilot(on: boolean) {
    if (this.mode.classList.contains('free') !== on) return;
    this.mode.textContent = on ? t('Autopilot') : t('Free drift');
    this.mode.classList.toggle('free', !on);
  }

  /**
   * The zero point: the center of the field, where the asteroids are densest and the arena
   * ends farthest away, with its distance. Always on screen, at the edge when behind.
   */
  setCenter(camera: THREE.Camera, me: Ship) {
    this.center.hidden = !me.alive;
    if (!me.alive) return;
    pin(this.center, camera, origin);
    setText(this.centerDistance, t('Center · {distance}', { distance: meters(me.flight.position.length()) }));
  }

  /**
   * The alarms below the crosshair, the worst first (see game/alarms.ts): the master caution
   * naming the worst level, one line per danger in its level's color with its countdown and an
   * arrow towards where it comes from, and the red edge of the screen while one is CRITICAL.
   */
  setAlarms(alarms: readonly Alarm[], camera: THREE.Camera) {
    const top = alarms[0]?.level ?? null;
    setHidden(this.master, !top);
    if (top) setText(this.master, t(MASTER[top]));
    for (const level of LEVELS) setClass(this.master, level, level === top);
    setClass(document.body, 'alarm-critical', top === 'critical');
    const rows = this.alarmRows;
    let shown = 0;
    for (const alarm of alarms) {
      if (!alarm.text || shown === rows.length) continue;
      const line = rows[shown++];
      setHidden(line.row, false);
      setText(line.text, alarm.seconds === null ? alarm.text : `${alarm.text} · ${alarm.seconds.toFixed(1)} s`);
      for (const level of LEVELS) setClass(line.row, level, level === alarm.level);
      setHidden(line.arrow, !alarm.hasDirection);
      if (!alarm.hasDirection) continue;
      // the direction as the screen sees it: right and up of the camera
      toward.copy(alarm.direction).applyQuaternion(unturn.copy(camera.quaternion).invert());
      const angle = Math.round(THREE.MathUtils.radToDeg(Math.atan2(toward.x, toward.y)) / ARROW_STEP) * ARROW_STEP;
      if (angle === line.angle) continue;
      line.angle = angle;
      line.arrow.style.rotate = `${angle}deg`;
    }
    for (; shown < rows.length; shown++) setHidden(rows[shown].row, true);
  }

  /**
   * The escape gauge in a gravity well: how much of the drive's thrust the well's hold takes
   * (see escapeLoad), from WELL_GAUGE on, in its alarm level's color; at 100 % there is no return.
   */
  setEscape(load: number | null) {
    // whole percents below 100, and 100 only past the point of no return
    const percent = load === null || load < WELL_GAUGE ? -1 : load >= WELL_LOST ? 100 : Math.min(99, Math.floor(load * 100));
    if (percent === this.escapeShown) return;
    this.escapeShown = percent;
    setHidden(this.escape, percent < 0);
    if (percent < 0) return;
    this.escapeFill.style.width = `${percent}%`;
    this.escapeValue.textContent = `${percent} %`;
    const level = wellLevel(load!);
    for (const each of LEVELS) setClass(this.escape, each, each === level);
  }

  /** Tunnel vision under sustained acceleration, 0..1. */
  setStrain(strain: number) {
    this.vignette.style.opacity = String(strain);
    this.vignette.style.setProperty('--tunnel', `${Math.round(70 - strain * 45)}%`);
  }

  /** A solar flare's heat on the screen, 0..1: its edges glow orange, then the whole picture. */
  setFlareHeat(heat: number) {
    const shown = heat < 0.01 ? '0' : heat.toFixed(2);
    if (this.flareHeat.style.opacity !== shown) this.flareHeat.style.opacity = shown;
  }

  /** A split or lap time against the best lap, for a few seconds: ahead in green, behind in red, without a best in white. */
  split(now: number, text: string, ahead: boolean | null, seconds = 3) {
    setText(this.splitText, text);
    this.splitText.classList.toggle('ahead', ahead === true);
    this.splitText.classList.toggle('behind', ahead === false);
    this.splitUntil = now + seconds;
  }

  /** A number of a round's countdown, or (`start`) its start word, in big neon: it pops in and fades out by itself; the start word punches harder, with a flash over the picture. */
  countdown(text: string, start = false) {
    this.countdownText.classList.toggle('start', start);
    pop(this.countdownText, text);
    if (start) restart(this.startFlash, 'flash');
  }

  /** The start lights over the countdown: `on` of `total` lit; none shows none. */
  setStartLights(on: number, total: number) {
    const lights = this.startLights;
    while (lights.children.length < total) lights.append(document.createElement('i'));
    for (let i = 0; i < lights.children.length; i++) lights.children[i].classList.toggle('on', i < on);
    setHidden(lights, on === 0);
    // the round's panel and the markers step aside while the lights count down
    setClass(this.root, 'counting', on > 0);
  }

  /**
   * The intro's card: the mode and arena of the round and its field, one pilot after another
   * sliding in, the own pilot marked; the rest of the HUD steps aside while it shows.
   */
  showIntro(card: IntroCard) {
    const intro = this.introCard;
    intro.querySelector('.intro-mode')!.textContent = card.title;
    intro.querySelector('.intro-arena')!.textContent = card.arena;
    intro.querySelector('.intro-tagline')!.textContent = card.tagline;
    const list = intro.querySelector('.intro-pilots')!;
    list.replaceChildren(
      ...card.pilots.map((pilot, i) => {
        const row = document.createElement('li');
        row.style.setProperty('--i', String(i));
        row.classList.toggle('own', pilot.own);
        const name = document.createElement('span');
        name.className = 'intro-name';
        name.append(swatch(pilot.tint, pilot.sovereign), ...markedName(pilot.kind, pilot.name));
        row.append(name);
        // the skills come from the game's own table, never from another browser
        if (pilot.skills) row.insertAdjacentHTML('beforeend', pilot.skills);
        return row;
      }),
    );
    const skip = intro.querySelector<HTMLButtonElement>('.intro-skip')!;
    skip.textContent = card.skip;
    skip.onclick = card.onSkip;
    intro.hidden = false;
    this.root.classList.add('intro');
  }

  hideIntro() {
    this.introCard.hidden = true;
    this.root.classList.remove('intro');
  }

  /**
   * A big moment's banner (see game/moments.ts), above the crosshair: it pops in and fades out by
   * itself after BANNER_SECONDS; meanwhile only a moment of the same `rank` or higher replaces it.
   */
  banner(now: number, text: string, rank: number) {
    if (now < this.bannerUntil && rank < this.bannerRank) return;
    this.bannerUntil = now + BANNER_SECONDS;
    this.bannerRank = rank;
    pop(this.bannerText, text);
  }

  private readonly bannerText = $('hud-banner');
  private bannerUntil = -Infinity;
  private bannerRank = 0;

  flashMessage(now: number, text: string, seconds = 2) {
    this.message.textContent = text;
    this.messageUntil = now + seconds;
  }

  hit() {
    this.hitmarker.classList.add('on');
    clearTimeout(this.hitmarkerTimer);
    this.hitmarkerTimer = window.setTimeout(() => this.hitmarker.classList.remove('on'), 80);
  }

  damaged() {
    this.damageFlash.classList.add('on');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.damageFlash.classList.remove('on'), 60);
  }

  /** A line in the kill feed: who (a ship, or what killed it), and whom, each behind its mark. */
  kill(now: number, killer: { kind: Kind; name: string }, victim: { kind: Kind; name: string }) {
    const item = document.createElement('li');
    item.dataset.at = String(now);
    const k = document.createElement('b');
    k.append(...markedName(killer.kind, killer.name));
    item.append(k, ' ✦ ', ...markedName(victim.kind, victim.name));
    this.killfeed.prepend(item);
  }

  /** The lock warning below the other warnings: what the shooter does, and who it is, behind its mark. */
  setLock(text: string, shooter: { kind: Kind; name: string } | null) {
    const key = shooter ? `${text}|${shooter.kind}|${shooter.name}` : '';
    if (this.lock.dataset.key === key) return;
    this.lock.dataset.key = key;
    this.lock.replaceChildren(...(shooter ? [`${text} · `, ...markedName(shooter.kind, shooter.name)] : []));
    this.lock.hidden = !shooter;
  }

  /**
   * Prograde marker where the ship is drifting to, retrograde marker where to point the
   * drive to brake.
   */
  updateVelocityMarkers(camera: THREE.Camera, me: Ship) {
    const velocity = me.flight.velocity;
    const show = me.alive && velocity.lengthSq() > 400;
    placeVelocityMarker(this.prograde, camera, velocity, 1, show);
    placeVelocityMarker(this.retrograde, camera, velocity, -1, show);
  }

  /**
   * Marks other ships in line of sight with their name; ships off screen get an arrow at the
   * screen edge with their name beside it (see placeNames).
   */
  updateMarkers(camera: THREE.Camera, ships: Ship[], me: Ship, visible: (ship: Ship) => boolean) {
    const { width, height } = viewport;
    const seen = this.seen;
    seen.clear();
    const labeled = this.labeled;
    labeled.length = 0;
    this.labeledMarkers.length = 0;
    const edges = this.edges;
    edges.length = 0;
    for (const ship of ships) {
      if (ship === me || !ship.alive || !visible(ship)) continue;
      seen.add(ship.id);
      const marker = this.markers.get(ship.id) ?? this.addMarker(ship);
      const element = marker.element;
      // in a round of sides a marker takes its side's color, else the ship's own; the Sovereign's glows gold either way
      const tint = shownTint(ship);
      if (marker.tint !== tint) {
        marker.tint = tint;
        element.style.setProperty('--tint', tint);
        setClass(element, 'sovereign', ship.sovereign);
      }
      projected.copy(ship.flight.position).project(camera);
      const behind = projected.z > 1;
      let x = projected.x;
      let y = projected.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const offscreen = behind || Math.abs(x) > EDGE_X || Math.abs(y) > EDGE_Y;
      let side = Side.Right;
      if (offscreen) {
        const scale = 1 / Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y, 1e-6);
        x *= scale;
        y *= scale;
        side = Math.abs(x) / EDGE_X >= Math.abs(y) / EDGE_Y ? (x > 0 ? Side.Right : Side.Left) : y > 0 ? Side.Top : Side.Bottom;
      }
      const left = ((x + 1) / 2) * width;
      const top = ((1 - y) / 2) * height;
      const distance = ship.flight.position.distanceTo(me.flight.position);
      if (offscreen) {
        const edge = (this.edgePool[edges.length] ??= { marker, left, top, side, distance });
        edge.marker = marker;
        edge.left = left;
        edge.top = top;
        edge.side = side;
        edge.distance = distance;
        edges.push(edge);
      } else {
        // a name that would land on one already written keeps only its mark
        let crowded = false;
        for (let i = 0; i < labeled.length; i += 2) crowded ||= Math.abs(labeled[i] - left) < LABEL_WIDTH && Math.abs(labeled[i + 1] - top) < LABEL_HEIGHT;
        if (!crowded) {
          labeled.push(left, top);
          this.labeledMarkers.push(marker);
        }
        setClass(element, 'crowded', crowded);
      }
      setClass(element, 'offscreen', offscreen);
      element.style.transform = `translate(${left}px, ${top}px)`;
      if (offscreen) element.style.setProperty('--angle', `${Math.atan2(-y, x)}rad`);
      setText(marker.distance, ` · ${meters(distance)}`);
    }
    for (const [id, marker] of this.markers) {
      if (seen.has(id)) continue;
      marker.element.remove();
      this.markers.delete(id);
    }
    if (edges.length || labeled.length) this.placeNames();
  }

  private addMarker(ship: Ship): Marker {
    const element = document.createElement('div');
    element.className = 'marker';
    // the mark and the name stay; only the distance behind them changes from frame to frame
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.append(...markedName(ship.kind, ship.name));
    const distance = document.createElement('span');
    distance.className = 'distance';
    element.append(tag, distance);
    this.markerLayer.append(element);
    const marker: Marker = { element, tag, distance, tint: '', name: ship.name, mark: !!ship.kind, width: 0, measuredFor: null };
    this.markers.set(ship.id, marker);
    return marker;
  }

  /**
   * Keeps the names clear of the arrows at the screen's edge and of the HUD's pieces: a name in
   * the picture that would run under one keeps only its mark. Then writes the names beside the
   * arrows, the nearest ship's first: inward of its arrow, or a line or a step along the edge
   * where that is taken, never over another name, an arrow or a piece of the HUD; where nothing
   * is free, the arrow goes without its name. On a phone the names at the edge are smaller and a
   * long one is cut short.
   */
  private placeNames() {
    const { width, height } = viewport;
    const size = document.body.classList.contains('touch') || width <= 600 || height <= 500 ? TAG_PHONE : TAG;
    const blocked = this.blocked;
    blocked.length = 0;
    this.measureObstacles();
    for (const value of this.obstacles) blocked.push(value);
    const edges = this.edges;
    for (const { left, top } of edges) blocked.push(left - ARROW_REACH, top - ARROW_REACH, left + ARROW_REACH, top + ARROW_REACH);
    // a name in the picture that would run under an arrow or a piece of the HUD keeps only its mark
    const labeled = this.labeled;
    for (let i = 0; i < labeled.length; i += 2) {
      const left = labeled[i] + NAME_LEFT;
      const top = labeled[i + 1] - LABEL_HEIGHT / 2;
      const crowded = hits(blocked, left, top, left + LABEL_WIDTH, top + LABEL_HEIGHT);
      setClass(this.labeledMarkers[i / 2].element, 'crowded', crowded);
      if (!crowded) blocked.push(left, top, left + LABEL_WIDTH, top + LABEL_HEIGHT);
    }
    edges.sort(nearestFirst);
    for (const { marker, left, top, side } of edges) {
      if (marker.measuredFor !== size) this.measureTag(marker, size);
      const w = marker.width;
      const h = size.line;
      const upright = side === Side.Left || side === Side.Right;
      const along = upright ? h + 2 : w / 2 + 8;
      let found = false;
      let x = 0;
      let y = 0;
      for (let k = 0; k <= 2 * TAG_TRIES && !found; k++) {
        const step = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * along;
        if (upright) {
          x = side === Side.Right ? left - TAG_GAP - w : left + TAG_GAP;
          y = top - h / 2 + step;
        } else {
          x = left - w / 2 + step;
          y = side === Side.Top ? top + TAG_GAP : top - TAG_GAP - h;
        }
        x = Math.min(Math.max(x, TAG_MARGIN), width - TAG_MARGIN - w);
        y = Math.min(Math.max(y, TAG_MARGIN), height - TAG_MARGIN - h);
        found = !hits(blocked, x, y, x + w, y + h);
      }
      setClass(marker.element, 'crowded', !found);
      if (!found) continue;
      blocked.push(x, y, x + w, y + h);
      marker.tag.style.setProperty('--at', `${Math.round(x - left)}px ${Math.round(y - top)}px`);
    }
  }

  /** How wide a ship's name runs at the screen's edge in a size, up to its widest; the label takes exactly that box. */
  private measureTag(marker: Marker, size: TagSize) {
    const context = (this.measure ??= document.createElement('canvas').getContext('2d')!);
    context.font = `${size.size}px ${getComputedStyle(this.markerLayer).fontFamily}`;
    const text = context.measureText(marker.name).width + (marker.mark ? MARK_EM * size.size : 0);
    marker.width = Math.min(size.max, Math.ceil(text) + 2 * TAG_PADDING + 2);
    marker.measuredFor = size;
    const style = marker.element.style;
    style.setProperty('--tag-size', `${size.size}px`);
    style.setProperty('--tag-line', `${size.line}px`);
    style.setProperty('--tag-width', `${marker.width}px`);
  }

  /** The boxes of the HUD's pieces the names at the edge keep clear of, measured anew every OBSTACLE_MS. */
  private measureObstacles() {
    const now = performance.now();
    if (now < this.obstaclesAt) return;
    this.obstaclesAt = now + OBSTACLE_MS;
    const obstacles = this.obstacles;
    obstacles.length = 0;
    for (const element of document.querySelectorAll(OBSTACLES)) {
      const box = ink(element);
      if (box) obstacles.push(box.left, box.top, box.right, box.bottom);
    }
  }
}

/** The edge of the screen an arrow sits at. */
const enum Side {
  Right,
  Left,
  Top,
  Bottom,
}

/** A ship's marker: its element, its name (beside the arrow at the screen's edge) and its distance. */
interface Marker {
  element: HTMLElement;
  tag: HTMLElement;
  distance: HTMLElement;
  /** What it is marked in, as last written (see shownTint). */
  tint: string;
  name: string;
  /** Its name carries a mark (see marks.ts). */
  mark: boolean;
  /** The name's width at the edge (px), in the size it was measured for. */
  width: number;
  measuredFor: TagSize | null;
}

/** An arrow at the screen's edge this frame, waiting for its name (see Hud.placeNames). */
interface Edge {
  marker: Marker;
  left: number;
  top: number;
  side: Side;
  distance: number;
}

const nearestFirst = (a: Edge, b: Edge) => a.distance - b.distance;

/** Whether a box overlaps one of the boxes (left, top, right, bottom; px, flat). */
function hits(boxes: readonly number[], left: number, top: number, right: number, bottom: number): boolean {
  for (let i = 0; i < boxes.length; i += 4) if (left < boxes[i + 2] && boxes[i] < right && top < boxes[i + 3] && boxes[i + 1] < bottom) return true;
  return false;
}

function setBar(bar: HTMLElement, fraction: number) {
  bar.style.width = `${Math.max(0, fraction) * 100}%`;
  bar.classList.toggle('low', fraction < 0.35);
}

const origin = new THREE.Vector3();

/** Places a marker on a point in space, clamped to the screen edge when off screen or behind. */
function pin(element: HTMLElement, camera: THREE.Camera, point: THREE.Vector3) {
  projected.copy(point).project(camera);
  let { x, y } = projected;
  const behind = projected.z > 1;
  if (behind) {
    x = -x;
    y = -y;
  }
  // points behind the camera always sit on the edge
  const scale = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, behind ? 1e-6 : 1);
  element.style.translate = `${((x * scale + 1) / 2) * viewport.width}px ${((1 - y * scale) / 2) * viewport.height}px`;
}

/** A distance in world units as the HUD shows it: meters, kilometers from 1000 m on. */
export function meters(units: number): string {
  const m = units * METERS_PER_UNIT;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Shows `text` in an element that pops in and fades out by its CSS animation (class `pop`). */
function pop(element: HTMLElement, text: string) {
  element.textContent = text;
  restart(element, 'pop');
}

/** Writes text only when it changed, so an unchanged HUD costs the browser no layout work. */
function setText(element: HTMLElement, text: string) {
  if (element.textContent !== text) element.textContent = text;
}

function setHidden(element: HTMLElement, hidden: boolean) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

function setClass(element: HTMLElement, name: string, on: boolean) {
  if (element.classList.contains(name) !== on) element.classList.toggle(name, on);
}

/** Plays a class's animation from its start again: a reflow between removing and adding the class restarts it. */
function restart(element: HTMLElement, name: string) {
  element.classList.remove(name);
  void element.offsetWidth;
  element.classList.add(name);
}

/** What the intro's card shows (see Hud.showIntro): the skills are markup of the game's own table. */
export interface IntroCard {
  title: string;
  arena: string;
  tagline: string;
  pilots: { name: string; kind: Kind; tint: string; sovereign: boolean; skills: string; own: boolean }[];
  skip: string;
  onSkip: () => void;
}

const ahead = new THREE.Vector3();

/** The prograde (sign 1) or retrograde (sign -1) marker, where the ship drifts to or from. */
function placeVelocityMarker(element: HTMLElement, camera: THREE.Camera, velocity: THREE.Vector3, sign: number, show: boolean) {
  ahead.copy(velocity).normalize().multiplyScalar(sign * 100000).add(camera.position).project(camera);
  const visible = show && ahead.z < 1 && Math.abs(ahead.x) < 1 && Math.abs(ahead.y) < 1;
  setHidden(element, !visible);
  if (visible) element.style.transform = `translate(${((ahead.x + 1) / 2) * viewport.width}px, ${((1 - ahead.y) / 2) * viewport.height}px)`;
}
