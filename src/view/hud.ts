import * as THREE from 'three';
import { MAX_HEAT, MAX_HULL, type Ship } from '../ship/ship';
import { METERS_PER_UNIT } from '../ship/flight';
import { CONTROLS, keyLabel, type Command, type Device } from '../input/input';
import { markedName, swatch, type Kind } from './marks';
import { shownTint } from '../ship/tints';
import { ink } from './ink';
import { between, DriftAids, driftAidsDrawn, driftAidsShown, findTag, hits, inPicture, Side, sideOf, toFrame, type FramePoint, type Segment, type TagRoom } from './screen';
import { msg, t } from '../i18n/i18n';
import { Attitude } from './attitude';
import { Streaks } from './streaks';
import { WELL_GAUGE, WELL_LOST, wellLevel, type Alarm, type AlarmLevel } from '../game/alarms';
import type { Reference } from '../world/arenas';
import { climbOf, closure, heightOf } from '../world/reference';

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
const OBSTACLES = '.hud-top, #hud-room, #school-panel, #hud-split, #hud-alerts > *, #transmission, #radar, .hud-bottom, #killfeed, #now-playing, .touch-button, #hud-altitude';
const OBSTACLE_MS = 500;
/** How long a fresh clone's projection takes to draw itself (s); style.css staggers its pieces within it. */
const BOOT_SECONDS = 1.2;
export { METERS_PER_UNIT };
/** The size of the window, as Game.resize last set it: reading it from the window after the HUD wrote to the page would force a layout. */
const viewport = { width: window.innerWidth, height: window.innerHeight };
/** The Host asked the system for reduced motion: the motion streaks stand still. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
  /** The strain the vignette shows (see setStrain). */
  private strainShown = '';
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
  private readonly referenceLayer = $('references');
  /** The marks of the fixed references, one per reference shown, reused from frame to frame (see setReferences). */
  private readonly referenceMarks: { element: HTMLElement; label: HTMLElement; glyph: string }[] = [];
  /** Where the ships' marks sit this frame (x, y pairs, px), whether named or not: the references give way to them. */
  private readonly marked: number[] = [];
  /** Where the crosshair sat when last placed (px). */
  private readonly aim = { x: NaN, y: NaN };
  /**
   * The panels the fixed references keep out of, and their boxes as last measured (see
   * setReferences): measured when one changes its size (shows, hides, takes a longer text), as a
   * ResizeObserver tells right after the page is laid out, so measuring costs no layout of its own.
   */
  private readonly panels = [...document.querySelectorAll<HTMLElement>(PANELS)];
  private readonly blocked: DOMRect[] = [];
  /** The screen or the controls changed: the panels are measured again before the next placing. */
  private blockedStale = true;
  private blockedTouch = false;
  private readonly altitude = $('hud-altitude');
  private readonly height = $('hud-height');
  private readonly climb = $('hud-climb');
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
  private readonly nameBlocked: number[] = [];
  /** The boxes of the names written at the edge this frame (flat, as nameBlocked). */
  private readonly tagBoxes: number[] = [];
  private readonly obstacles: number[] = [];
  private obstaclesAt = 0;
  private measure: CanvasRenderingContext2D | null = null;
  private readonly markerLayer = document.createElement('div');
  private readonly attitude = new Attitude($<HTMLCanvasElement>('hud-attitude'));
  private readonly streaks = new Streaks($<HTMLCanvasElement>('hud-streaks'));
  private messageUntil = 0;
  /** The projection boots until then (see boot); -1 when it stands. */
  private bootUntil = -1;
  private hitmarkerTimer = 0;
  private flashTimer = 0;
  /** The keys shown before the readouts at the bottom, and the device they are shown for. */
  private readonly keys = [...document.querySelectorAll<HTMLElement>('.hud-key')];
  private keysFor: Device | null = null;

  constructor() {
    const observer = new ResizeObserver(() => this.measurePanels());
    for (const panel of this.panels) observer.observe(panel);
    // a flash plays once: a mark hidden and shown again must not replay it
    for (const element of [this.prograde, this.courseArrow]) {
      const done = () => element.classList.remove('flash');
      element.addEventListener('animationend', done);
      element.addEventListener('animationcancel', done);
    }
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

  /**
   * The window's new size (see viewport) and the picture's pixels per CSS pixel (see
   * view/graphics): the attitude's canvas covers the whole screen, so it is drawn as sharp as the
   * picture under it, at least one pixel per CSS pixel and at most two.
   */
  setViewport(width: number, height: number, pixelRatio: number) {
    viewport.width = width;
    viewport.height = height;
    this.blockedStale = true;
    const ratio = Math.min(Math.max(pixelRatio, Math.min(1, window.devicePixelRatio)), 2);
    this.attitude.setViewport(width, height, ratio);
    this.streaks.setViewport(width, height, ratio);
  }

  /**
   * The motion streaks (see Streaks) for the ship moving at `velocity`, `count` of them, while
   * `show`; standing still where the Host asked for reduced motion.
   */
  updateStreaks(now: number, camera: THREE.PerspectiveCamera, velocity: THREE.Vector3, show: boolean, count: number) {
    this.streaks.update(now, camera, velocity, show, count, reducedMotion.matches);
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
    for (const mark of this.referenceMarks) mark.element.hidden = true;
    this.altitude.hidden = true;
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

  /** What the crosshair shows the laser would hit now (see setOnTarget). */
  get onTarget(): boolean {
    return this.crosshair.classList.contains('on-target') || this.crosshair.classList.contains('on-armor');
  }

  /**
   * The crosshair turns orange while the laser would hit a hull: bright and glowing over a drive,
   * a plain orange ring over armor, where a shot only heats the laser. Over a ship of the own
   * side it stays azure, crossed out, with FRIEND beneath: a shot would hit it all the same.
   */
  setOnTarget(hit: 'drive' | 'armor' | 'friend' | null) {
    setClass(this.crosshair, 'on-target', hit === 'drive');
    setClass(this.crosshair, 'on-armor', hit === 'armor');
    setClass(this.crosshair, 'on-friend', hit === 'friend');
  }

  /** The crosshair and the hit marker sit where the nose points (see Game.aimCrosshair). */
  setCrosshair(camera: THREE.Camera, point: THREE.Vector3) {
    pin(this.hitmarker, camera, point);
    const at = pin(this.crosshair, camera, point);
    this.aim.x = at.x;
    this.aim.y = at.y;
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
    const at = pin(this.waypoint, camera, point);
    this.waypointAt.x = at.x;
    this.waypointAt.y = at.y;
  }

  /** Where the waypoint sat when last placed (px). */
  private readonly waypointAt = { x: NaN, y: NaN };

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
   * The fixed references (see world/reference): the field's center, the sun, the arena's big
   * things and the mode's bases, each a small dim glyph with its label (and distance), where it
   * lies on screen or at the edge as the ships' arrows are. They give way first: one that would
   * sit on a ship's mark or its name at the screen's edge, the waypoint, the crosshair or a reference before it is left out, and
   * one whose label would run into a ship's name keeps only its glyph. Called after updateMarkers.
   */
  setReferences(camera: THREE.Camera, me: Ship, references: readonly Reference[]) {
    const marks = this.referenceMarks;
    const placed = this.labeled;
    // the panels move with the screen's size and the touch controls (rarely: then measured here)
    const blocked = this.blocked;
    const touch = document.body.classList.contains('touch');
    if (this.blockedStale || touch !== this.blockedTouch) {
      this.blockedTouch = touch;
      this.measurePanels();
    }
    const start = placed.length;
    let shown = 0;
    for (const reference of me.alive ? references : NONE) {
      let mark = marks[shown];
      if (!mark) {
        const element = document.createElement('div');
        element.className = 'reference';
        const label = document.createElement('span');
        label.className = 'hud-label';
        element.append(label);
        this.referenceLayer.append(element);
        mark = { element, label, glyph: '' };
        marks.push(mark);
      }
      const spot = toScreen(camera, reference.position, REFERENCE_EDGE_X, REFERENCE_EDGE_Y);
      // a reference on another mark, or on the crosshair, is left out
      let taken = near(spot.x, spot.y, this.aim.x, this.aim.y, REFERENCE_ROOM) || (!this.waypoint.hidden && near(spot.x, spot.y, this.waypointAt.x, this.waypointAt.y, REFERENCE_ROOM));
      for (let i = 0; !taken && i < this.marked.length; i += 2) taken = near(spot.x, spot.y, this.marked[i], this.marked[i + 1], REFERENCE_ROOM);
      for (let i = start; !taken && i < placed.length; i += 2) taken = near(spot.x, spot.y, placed[i], placed[i + 1], REFERENCE_ROOM);
      const name = t(reference.label);
      const distance = reference.distance ? me.flight.position.distanceTo(reference.position) - (reference.radius ?? 0) : 0;
      const text = reference.distance ? t('{name} · {distance}', { name, distance: meters(Math.max(0, distance)) }) : name;
      // where glyph and label reach (see .reference in style.css): the label above the glyph, or
      // at the edge beside it, towards the middle
      const east = spot.x > viewport.width / 2;
      const width = text.length * REFERENCE_CHAR;
      const half = Math.max(GLYPH, width / 2);
      const left = spot.offscreen ? (east ? spot.x - GLYPH - width - 6 : spot.x - GLYPH) : spot.x - half;
      const right = spot.offscreen ? (east ? spot.x + GLYPH : spot.x + GLYPH + width + 6) : spot.x + half;
      const top = spot.offscreen ? spot.y - GLYPH : spot.y - GLYPH - 18;
      for (let i = 0; !taken && i < blocked.length; i++) {
        const box = blocked[i];
        taken = left < box.right + PANEL_ROOM && right > box.left - PANEL_ROOM && top < box.bottom + PANEL_ROOM && spot.y + GLYPH > box.top - PANEL_ROOM;
      }
      // a ship's name at the screen's edge stands first
      taken ||= hits(this.tagBoxes, left, top, right, spot.y + GLYPH);
      if (taken) continue;
      shown++;
      setHidden(mark.element, false);
      if (mark.glyph !== reference.glyph) {
        mark.glyph = reference.glyph;
        mark.element.dataset.glyph = reference.glyph;
      }
      // its label only where it runs into no name written before it
      let crowded = false;
      for (let i = 0; !crowded && i < placed.length; i += 2) crowded = Math.abs(placed[i] - spot.x) < LABEL_WIDTH && Math.abs(placed[i + 1] - spot.y) < LABEL_HEIGHT;
      placed.push(spot.x, spot.y);
      setClass(mark.element, 'crowded', crowded);
      setClass(mark.element, 'offscreen', spot.offscreen);
      setClass(mark.element, 'east', east);
      mark.element.style.translate = `${Math.round(spot.x)}px ${Math.round(spot.y)}px`;
      setText(mark.label, text);
    }
    for (; shown < marks.length; shown++) setHidden(marks[shown].element, true);
  }

  /** Measures the boxes of the panels shown (see panels). */
  private measurePanels() {
    this.blockedStale = false;
    this.blocked.length = 0;
    for (const panel of this.panels) {
      const box = panel.getBoundingClientRect();
      if (box.width >= 1 && box.height >= 1) this.blocked.push(box);
    }
  }

  /** The height above the reference plane and the climb (see world/reference), right of the crosshair; hidden while no clone flies. */
  setAltitude(me: Ship) {
    setHidden(this.altitude, !me.alive);
    if (!me.alive) return;
    const height = heightOf(me.flight.position);
    setText(this.height, `${height < 0 ? '−' : '+'}${meters(Math.abs(height))}`);
    const climb = Math.round(climbOf(me.flight.velocity) * METERS_PER_UNIT);
    setText(this.climb, `${climb > 0 ? '▲' : climb < 0 ? '▼' : '◆'} ${t('{speed} m/s', { speed: Math.abs(climb) })}`);
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

  /** Tunnel vision under sustained acceleration, 0..1: only hinted, the edges darken a little and close in a little, so the picture stays readable. */
  setStrain(strain: number) {
    // in hundredths, written only when they change: a style write every frame restyles the overlay
    const shown = strain < 0.005 ? '0' : strain.toFixed(2);
    if (shown === this.strainShown) return;
    this.strainShown = shown;
    this.vignette.style.opacity = shown;
    this.vignette.style.setProperty('--tunnel', `${Math.round(75 - Number(shown) * 20)}%`);
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
   * A `note` (a streak's bonus) stands smaller beneath it.
   */
  banner(now: number, text: string, rank: number, note = '') {
    if (now < this.bannerUntil && rank < this.bannerRank) return;
    this.bannerUntil = now + BANNER_SECONDS;
    this.bannerRank = rank;
    pop(this.bannerText, text);
    if (note) {
      const line = document.createElement('div');
      line.className = 'banner-note';
      line.textContent = note;
      this.bannerText.append(line);
    }
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
   * The prograde marker ("Course") where the ship drifts to, the retrograde marker ("Brake")
   * where to point the drive to brake. In free drift (`free`, the Host's own clone `own`), where
   * the nose and the flight part, two aids show from DRIFT_AID_SPEED on (see driftAidsShown): a
   * faint dashed line from the crosshair to the Course marker, so the gap between where the laser
   * fires and where the ship flies is seen at a glance, and, while the Course marker lies off
   * screen, an arrow at the screen's edge pointing to it, named like a ship's (see placeNames),
   * the line running to that arrow. Called before updateMarkers, which places the arrow's name.
   */
  updateVelocityMarkers(camera: THREE.Camera, me: Ship, own: boolean, free: boolean) {
    const velocity = me.flight.velocity;
    const show = me.alive && velocity.lengthSq() > 400;
    placeVelocityMarker(this.prograde, camera, velocity, 1, show, this.velocityAt);
    placeVelocityMarker(this.retrograde, camera, velocity, -1, show);
    const drawn = driftAidsDrawn(driftAidsShown(own, me.alive, free, velocity.length()) && Number.isFinite(this.aim.x), !this.prograde.hidden, !this.retrograde.hidden);
    const aids = drawn !== DriftAids.None;
    const course = this.courseEdge;
    // the prograde marker's place as the screen sees it, when it shows (see placeVelocityMarker)
    let toX = this.velocityAt.x;
    let toY = this.velocityAt.y;
    course.shown = drawn === DriftAids.Arrow;
    if (course.shown) {
      ahead.copy(velocity).normalize().multiplyScalar(100000).add(camera.position).project(camera);
      const at = toFrame(ahead.x, ahead.y, ahead.z > 1, EDGE_X, EDGE_Y, viewport.width, viewport.height, spot);
      course.x = at.x;
      course.y = at.y;
      course.side = sideOf(at.x, at.y, EDGE_X, EDGE_Y, viewport.width, viewport.height);
      toX = at.x;
      toY = at.y;
      const x = Math.round(at.x);
      const y = Math.round(at.y);
      const angle = Math.round(THREE.MathUtils.radToDeg(at.angle) / ARROW_STEP) * ARROW_STEP;
      if (x !== course.shownX || y !== course.shownY || angle !== course.angle) {
        course.shownX = x;
        course.shownY = y;
        course.angle = angle;
        this.courseArrow.style.translate = `${x}px ${y}px`;
        this.courseArrow.style.setProperty('--angle', `${angle}deg`);
      }
    }
    setHidden(this.courseArrow, !course.shown);
    if (this.flashDue) {
      this.flashDue = false;
      // a hidden mark would play it once it shows, out of the blue
      if (!this.prograde.hidden) restart(this.prograde, 'flash');
      if (course.shown) restart(this.courseArrow, 'flash');
    }
    // the line ends short of the crosshair's ring and of the marker (or the arrow's point)
    const line = aids ? between(this.aim.x, this.aim.y, toX, toY, DRIFT_LINE_START, course.shown ? DRIFT_LINE_ARROW : DRIFT_LINE_END, DRIFT_LINE_SHORTEST, driftSegment) : null;
    const shown = !!line && line.length > 0;
    setHidden(this.driftLine, !shown);
    if (!shown) return;
    const x = Math.round(line.x);
    const y = Math.round(line.y);
    const length = Math.round(line.length);
    const angle = Math.round(THREE.MathUtils.radToDeg(line.angle) * 2) / 2;
    const written = this.driftDrawn;
    if (x === written.x && y === written.y && length === written.length && angle === written.angle) return;
    written.x = x;
    written.y = y;
    written.length = length;
    written.angle = angle;
    this.driftLine.style.translate = `${x}px ${y}px`;
    this.driftLine.style.width = `${length}px`;
    this.driftLine.style.rotate = `${angle}deg`;
  }

  /**
   * The Host has just switched to free drift: the Course marker (or its arrow at the screen's
   * edge) flashes once, so the eye finds where the ship really flies (see .flash in style.css).
   */
  flashCourse() {
    this.flashDue = true;
  }

  /** A flash waits for the next placing of the marks, when the Course arrow of free drift shows (see updateVelocityMarkers). */
  private flashDue = false;

  /** Where the prograde marker sits on screen while it shows (px), as placeVelocityMarker last placed it. */
  private readonly velocityAt = { x: NaN, y: NaN };
  private readonly driftLine = $('drift-line');
  /** What the drift line was last written as (px and degrees), so an unchanged line writes nothing. */
  private readonly driftDrawn = { x: NaN, y: NaN, length: NaN, angle: NaN };
  private readonly courseArrow = $('course-arrow');
  private readonly courseTag = this.courseArrow.querySelector<HTMLElement>('.course-tag')!;
  /** The Course arrow this frame: where it points from (px), its edge, and what was last written of it and of its name's place. */
  private readonly courseEdge = { shown: false, x: 0, y: 0, side: Side.Right, shownX: NaN, shownY: NaN, angle: NaN, tagX: NaN, tagY: NaN };
  private courseTagWidth = 0;
  private courseTagFor: TagSize | null = null;
  private courseTagText = '';

  /**
   * Marks other ships in line of sight with their name; ships off screen get an arrow at the
   * screen edge with their name beside it (see placeNames). The `target`'s mark adds its closure
   * rate and is set in the numbers' face.
   */
  updateMarkers(camera: THREE.Camera, ships: Ship[], me: Ship, visible: (ship: Ship) => boolean, target: Ship | null = null) {
    const { width, height } = viewport;
    const seen = this.seen;
    seen.clear();
    const labeled = this.labeled;
    labeled.length = 0;
    this.labeledMarkers.length = 0;
    this.tagBoxes.length = 0;
    const edges = this.edges;
    edges.length = 0;
    const marked = this.marked;
    marked.length = 0;
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
      // a ship of the own side is marked by a ring, a rival by a square, whatever their colors
      setClass(element, 'ally', ship.allyOf(me));
      const { x: left, y: top, offscreen, angle } = toScreen(camera, ship.flight.position, EDGE_X, EDGE_Y);
      marked.push(left, top);
      const side = sideOf(left, top, EDGE_X, EDGE_Y, width, height);
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
      if (offscreen) element.style.setProperty('--angle', `${angle}rad`);
      // the target's range and closure rate, as a fighter's HUD shows them (see closure)
      const range = meters(distance);
      const cue = ship === target;
      setClass(element, 'target', cue);
      setText(
        marker.distance,
        cue ? ` · ${t('{range} · Vc {vc}', { range, vc: signed(Math.round(closure(me.flight.position, me.flight.velocity, ship.flight.position, ship.flight.velocity) * METERS_PER_UNIT)) })}` : ` · ${range}`,
      );
    }
    for (const [id, marker] of this.markers) {
      if (seen.has(id)) continue;
      marker.element.remove();
      this.markers.delete(id);
    }
    // the Course arrow (see updateVelocityMarkers): the references keep clear of it too
    if (this.courseEdge.shown) marked.push(this.courseEdge.x, this.courseEdge.y);
    if (edges.length || labeled.length || this.courseEdge.shown) this.placeNames();
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
    const blocked = this.nameBlocked;
    blocked.length = 0;
    this.measureObstacles();
    for (const value of this.obstacles) blocked.push(value);
    const edges = this.edges;
    for (const { left, top } of edges) blocked.push(left - ARROW_REACH, top - ARROW_REACH, left + ARROW_REACH, top + ARROW_REACH);
    const course = this.courseEdge;
    if (course.shown) blocked.push(course.x - ARROW_REACH, course.y - ARROW_REACH, course.x + ARROW_REACH, course.y + ARROW_REACH);
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
      const found = findTag(blocked, left, top, side, w, h, width, height, TAG_ROOM, tagAt);
      setClass(marker.element, 'crowded', !found);
      if (!found) continue;
      const { x, y } = tagAt;
      blocked.push(x, y, x + w, y + h);
      // the fixed references give way to it (see setReferences)
      this.tagBoxes.push(x, y, x + w, y + h);
      marker.tag.style.setProperty('--at', `${Math.round(x - left)}px ${Math.round(y - top)}px`);
    }
    // the Course arrow's name comes last: its arrow speaks for itself
    if (!course.shown) return;
    // its text is the page's (data-i18n), measured anew in another size or language
    const text = this.courseTag.textContent!;
    if (this.courseTagFor !== size || this.courseTagText !== text) {
      const context = (this.measure ??= document.createElement('canvas').getContext('2d')!);
      context.font = `${size.size}px ${getComputedStyle(this.markerLayer).fontFamily}`;
      // in capitals, with the letter spacing of .course-tag in style.css
      this.courseTagWidth = Math.ceil(context.measureText(text.toUpperCase()).width + text.length * COURSE_TAG_SPACING * size.size) + 2 * TAG_PADDING + 2;
      this.courseTagFor = size;
      this.courseTagText = text;
      const style = this.courseArrow.style;
      style.setProperty('--tag-size', `${size.size}px`);
      style.setProperty('--tag-line', `${size.line}px`);
      style.setProperty('--tag-width', `${this.courseTagWidth}px`);
    }
    const w = this.courseTagWidth;
    const found = findTag(blocked, course.x, course.y, course.side, w, size.line, width, height, TAG_ROOM, tagAt);
    setClass(this.courseArrow, 'crowded', !found);
    if (!found) return;
    blocked.push(tagAt.x, tagAt.y, tagAt.x + w, tagAt.y + size.line);
    this.tagBoxes.push(tagAt.x, tagAt.y, tagAt.x + w, tagAt.y + size.line);
    const dx = Math.round(tagAt.x - course.x);
    const dy = Math.round(tagAt.y - course.y);
    if (dx !== course.tagX || dy !== course.tagY) {
      course.tagX = dx;
      course.tagY = dy;
      this.courseTag.style.translate = `${dx}px ${dy}px`;
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

function setBar(bar: HTMLElement, fraction: number) {
  bar.style.width = `${Math.max(0, fraction) * 100}%`;
  bar.classList.toggle('low', fraction < 0.35);
}

/** Where a point in space shows on screen (see toScreen), reused from call to call. */
const spot: FramePoint = { x: 0, y: 0, offscreen: false, angle: 0 };

/**
 * Where a point in space sits on screen (px), for a mark at its place or, off screen or behind,
 * on the frame within `edgeX` and `edgeY` of the middle (shares of half the screen), with the
 * angle an arrow there points out at (rad; see toFrame). Returns the same object every call.
 */
function toScreen(camera: THREE.Camera, point: THREE.Vector3, edgeX = 0.95, edgeY = 0.8) {
  projected.copy(point).project(camera);
  return toFrame(projected.x, projected.y, projected.z > 1, edgeX, edgeY, viewport.width, viewport.height, spot);
}

/** Places a marker on a point in space, clamped to the screen edge when off screen or behind; returns where (see toScreen). */
function pin(element: HTMLElement, camera: THREE.Camera, point: THREE.Vector3) {
  const at = toScreen(camera, point, 0.92, 0.85);
  element.style.translate = `${at.x}px ${at.y}px`;
  return at;
}

/** No reference, while no clone flies. */
const NONE: readonly Reference[] = [];

/** The frame the fixed references sit on off screen (see toScreen): inside the heading tape and the round's panel. */
const REFERENCE_EDGE_X = 0.92;
const REFERENCE_EDGE_Y = 0.62;

/** The HUD's panels and texts a fixed reference keeps out of. */
const PANELS = '#radar, #now-playing, .hud-top, #hud-room, #school-panel, #hud-split, #hud-alerts > *, #transmission, .hud-bottom, #killfeed, #hud-altitude, #touch .touch-button';

/** A fixed reference's glyph reaches this far from its point (px), each letter of its label about REFERENCE_CHAR (px), and it keeps PANEL_ROOM from a panel (px). */
const GLYPH = 8;
const REFERENCE_CHAR = 8;
const PANEL_ROOM = 4;

/** A fixed reference keeps this far from any other mark (px), or it is left out. */
const REFERENCE_ROOM = 30;

/** Whether two points on screen lie within `room` of each other (px). */
const near = (x: number, y: number, x2: number, y2: number, room: number) => Math.abs(x - x2) < room && Math.abs(y - y2) < room;

/** A number with its sign, a plus too (a typographic minus for the negative). */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

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

/** The prograde (sign 1) or retrograde (sign -1) marker, where the ship drifts to or from; where it sits goes into `at` (px) while it shows. */
function placeVelocityMarker(element: HTMLElement, camera: THREE.Camera, velocity: THREE.Vector3, sign: number, show: boolean, at: { x: number; y: number } = velocityScratch) {
  ahead.copy(velocity).normalize().multiplyScalar(sign * 100000).add(camera.position).project(camera);
  const visible = show && inPicture(ahead.x, ahead.y, ahead.z);
  setHidden(element, !visible);
  if (!visible) return;
  at.x = ((ahead.x + 1) / 2) * viewport.width;
  at.y = ((1 - ahead.y) / 2) * viewport.height;
  element.style.transform = `translate(${at.x}px, ${at.y}px)`;
}

const velocityScratch = { x: 0, y: 0 };
/** The drift line this frame (see Hud.updateVelocityMarkers), reused. */
const driftSegment: Segment = { x: 0, y: 0, length: 0, angle: 0 };
/** The drift line keeps clear of the crosshair's ring and its ticks, of the prograde marker's fins and of the Course arrow (px), and is left out shorter than DRIFT_LINE_SHORTEST (px), where the two marks all but touch. */
const DRIFT_LINE_START = 30;
const DRIFT_LINE_END = 26;
const DRIFT_LINE_ARROW = 20;
const DRIFT_LINE_SHORTEST = 16;
/** The letter spacing of the Course arrow's name (em, see .course-tag in style.css). */
const COURSE_TAG_SPACING = 0.08;
/** How a name is placed beside its arrow at the screen's edge (see findTag). */
const TAG_ROOM: TagRoom = { gap: TAG_GAP, margin: TAG_MARGIN, tries: TAG_TRIES };
/** Where findTag found a name's place, reused. */
const tagAt = { x: 0, y: 0 };
