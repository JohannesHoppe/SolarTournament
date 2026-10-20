import type { Spoken } from './music/band';
import { renderTrack, trackSeconds } from './music/preview';
import { bindVolume, Radio } from './music/radio';
import { createSong, ROUND_SECONDS, titleFor, type SectionKind, type Song } from './music/songs';
import { showTransmission } from './music/transmission';

/**
 * Radio 2584's own page: enter a title, and the track it grows plays again or downloads as a
 * WAV file. The title is the seed, so a track heard in a round can always be found again.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const input = $<HTMLInputElement>('title');
let song: Song | null = null;
let context: AudioContext | null = null;
let radio: Radio | null = null;
let playingSince: number | null = null;
/** Play was pressed and the band is still loading. */
let starting = false;
/** Where the track plays from (s): the start, or where the Host moved the playhead. */
let from = 0;
const seek = $<HTMLInputElement>('track-seek');
/** The Host holds the playhead: the clock does not move it meanwhile. */
let dragging = false;

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
/** Capitalizes each word; words start after a space, so ß or ö inside a word stay as they are. */
const tidy = (title: string) => title.trim().replace(/\s+/g, ' ').replace(/(^| )(\p{L})/gu, (_, space: string, c: string) => space + c.toUpperCase());

const SECTION_LABELS: Record<SectionKind, string> = { intro: 'Intro', groove: 'Groove', peak: 'Peak', break: 'Breakdown', strip: 'Strip', gap: 'Gap', finale: 'Finale', outro: 'Outro' };

function tune(title: string) {
  const clean = tidy(title);
  if (!clean) return;
  stop();
  song = createSong(clean, 'round', ROUND_SECONDS);
  input.value = clean;
  history.replaceState(null, '', `?title=${encodeURIComponent(clean)}`);
  $('track').hidden = false;
  $('track-title').textContent = song.title;
  $('track-facts').textContent = `${song.flavor} · ${song.strategy} · ${song.bpm} bpm`;
  const length = trackSeconds(song);
  $('track-length').textContent = time(length);
  seek.max = String(Math.floor(length));
  showPosition(0);
  $('download-status').textContent = '';
  // the shape of the track: one block per section, as wide as it is long
  const form = $('track-form');
  form.replaceChildren(
    ...song.form.map((section) => {
      const block = document.createElement('span');
      block.className = `section ${section.kind}`;
      block.style.flexGrow = String(section.bars);
      block.title = `${SECTION_LABELS[section.kind]}, ${section.bars} bars`;
      return block;
    }),
  );
}

function play() {
  if (!song) return;
  context ??= new AudioContext();
  void context.resume();
  // the track's clock starts when the band has loaded and takes the song, not at the click,
  // so the first bars are not lost to loading
  radio ??= new Radio(context, context.destination, () => {
    if (!starting) return;
    starting = false;
    playingSince = performance.now() - from * 1000;
  }, subtitle, false);
  starting = true;
  playingSince = performance.now() - from * 1000;
  $('play').textContent = 'Stop';
}

/** Stops the track; the next Play starts it from the beginning. */
function stop() {
  radio?.stop();
  playingSince = null;
  starting = false;
  from = 0;
  showPosition(0);
  $('play').textContent = 'Play';
}

/** Moves the playhead: a playing track jumps there (the radio follows its clock), a stopped one plays from there. */
function jump(seconds: number) {
  from = seconds;
  if (playingSince !== null && !starting) playingSince = performance.now() - seconds * 1000;
  showPosition(seconds);
}

function showPosition(seconds: number) {
  $('track-position').textContent = time(seconds);
  seek.parentElement!.style.setProperty('--progress', song ? `${(100 * seconds) / trackSeconds(song)}%` : '0%');
  if (!dragging) seek.value = String(Math.floor(seconds));
}

function subtitle(spoken: Spoken, delay: number) {
  showTransmission(spoken, delay, song?.title ?? null);
}

/** Seconds into the track; where it starts while the band is still loading. */
const elapsed = () => (starting || playingSince === null ? from : (performance.now() - playingSince) / 1000);

/** Feeds the radio its position and moves the clock. */
function frame() {
  if (song && radio && playingSince !== null) {
    const seconds = elapsed();
    radio.setCue({ title: song.title, energy: 'round', elapsed: seconds, roundLength: ROUND_SECONDS });
    showPosition(seconds);
  }
  requestAnimationFrame(frame);
}

/** The track stops after its outro; checked on a timer, which also runs in a hidden tab. */
function checkEnd() {
  if (song && playingSince !== null && elapsed() > trackSeconds(song)) stop();
}

async function download() {
  if (!song) return;
  // the track as it was tuned when the pressing began, even if the Host tunes another meanwhile
  const pressing = song;
  const button = $<HTMLButtonElement>('download');
  const status = $('download-status');
  button.disabled = true;
  status.textContent = `Pressing ${pressing.title}…`;
  try {
    const wav = await renderTrack(pressing, 0, trackSeconds(pressing), 44100, (done) => {
      status.textContent = `Pressing ${pressing.title}… ${Math.round(done * 100)} %`;
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    link.download = `SolarTournament - ${pressing.title}.wav`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    status.textContent = `${(wav.byteLength / 1048576).toFixed(0)} MB. Make the sponsor happy.`;
  } catch (error) {
    console.error(error);
    status.textContent = 'Pressing failed. Try again in Chrome or Edge.';
  } finally {
    button.disabled = false;
  }
}

$('tuner').addEventListener('submit', (event) => {
  event.preventDefault();
  tune(input.value);
});
input.addEventListener('change', () => tune(input.value));
$('random').addEventListener('click', () => tune(titleFor(1 + Math.floor(Math.random() * 2147483000))));
$('play').addEventListener('click', () => (playingSince === null ? play() : stop()));
$('download').addEventListener('click', () => void download());
seek.addEventListener('input', () => jump(Number(seek.value)));
seek.addEventListener('pointerdown', () => (dragging = true));
window.addEventListener('pointerup', () => (dragging = false));
bindVolume($<HTMLInputElement>('radio-volume'));

tune(new URLSearchParams(location.search).get('title') ?? titleFor(1 + Math.floor(Math.random() * 2147483000)));
requestAnimationFrame(frame);
setInterval(checkEnd, 500);
