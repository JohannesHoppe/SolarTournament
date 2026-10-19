import type { Spoken } from './music/band';
import { trackSeconds } from './music/preview';
import { Radio } from './music/radio';
import { createSong, titleFor, type SectionKind, type Song } from './music/songs';

/**
 * Radio 2584's own page: enter a title, and the track it grows plays again or downloads as a
 * WAV file. The title is the seed, so a track heard in a round can always be found again.
 */

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ROUND_SECONDS = 5 * 60;

const input = $<HTMLInputElement>('title');
let song: Song | null = null;
let context: AudioContext | null = null;
let radio: Radio | null = null;
let playingSince: number | null = null;
let transmissionTimer = 0;

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const tidy = (title: string) => title.trim().replace(/\s+/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

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
  $('track-position').textContent = '0:00';
  $('track-form').style.setProperty('--progress', '0%');
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
  radio ??= new Radio(context, context.destination, () => {}, subtitle, false);
  playingSince = performance.now();
  $('play').textContent = 'Stop';
}

function stop() {
  radio?.stop();
  playingSince = null;
  $('play').textContent = 'Play';
}

function subtitle(spoken: Spoken, delay: number) {
  const speaker = spoken.line.startsWith('radio') ? 'Radio 2584' : spoken.language === 'de' ? 'Der Präsident' : 'The Orange President';
  const text = spoken.line.startsWith('radio') && song
    ? `${spoken.language === 'de' ? 'Es läuft' : 'Now playing'}: ${song.title}`
    : spoken.line.split(/(?<=[.?!])\s+/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  window.setTimeout(() => {
    const box = $('transmission');
    box.className = 'regime';
    $('transmission-speaker').textContent = speaker;
    $('transmission-text').textContent = /[.?!]$/.test(text) ? text : text + '.';
    box.hidden = false;
    clearTimeout(transmissionTimer);
    transmissionTimer = window.setTimeout(() => (box.hidden = true), spoken.duration * 1000 + 1800);
  }, Math.max(0, delay));
}

/** Feeds the radio its position and moves the clock; the track stops after its outro. */
function frame() {
  if (song && radio && playingSince !== null) {
    const elapsed = (performance.now() - playingSince) / 1000;
    if (elapsed > trackSeconds(song)) stop();
    else {
      radio.setCue({ title: song.title, energy: 'round', elapsed, roundLength: ROUND_SECONDS });
      $('track-position').textContent = time(elapsed);
      $('track-form').style.setProperty('--progress', `${(100 * elapsed) / trackSeconds(song)}%`);
    }
  }
  requestAnimationFrame(frame);
}

async function download() {
  if (!song) return;
  const button = $<HTMLButtonElement>('download');
  const status = $('download-status');
  button.disabled = true;
  status.textContent = `Pressing ${song.title}…`;
  try {
    const { renderTrack } = await import('./music/preview');
    const title = song.title;
    const wav = await renderTrack(song, 0, trackSeconds(song), 44100, (done) => {
      status.textContent = `Pressing ${title}… ${Math.round(done * 100)} %`;
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    link.download = `SolarTournament - ${song.title}.wav`;
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

tune(new URLSearchParams(location.search).get('title') ?? titleFor(1 + Math.floor(Math.random() * 2147483000)));
requestAnimationFrame(frame);
