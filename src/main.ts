import { loadAssets } from './assets';
import { Sound } from './sound/audio';
import { Game } from './game/game';
import { initLocale, t, translatePage } from './i18n/i18n';

async function start() {
  initLocale();
  translatePage();
  const loading = document.getElementById('loading')!;
  if (!document.createElement('canvas').getContext('webgl2')) {
    loading.hidden = true;
    document.getElementById('no-webgl')!.hidden = false;
    return;
  }

  const sound = new Sound();
  const assets = await loadAssets(sound.context);
  sound.setBuffers(assets.sounds);

  const game = new Game(document.getElementById('game')!, assets, sound);
  // the loading screen stays until the game stands, so a failure still has a place to show
  loading.hidden = true;
  if (import.meta.env.DEV) Object.assign(window, { game });
  // the benchmark and the frame meter, loaded only when the address asks for them (see bench.ts)
  const params = new URLSearchParams(location.search);
  if (params.has('bench') || params.has('fps')) {
    const bench = await import('./bench');
    bench.showMeter(game);
    if (params.has('bench')) void bench.runBench(game, Number(params.get('bench')) || BENCH_SECONDS);
  }
}

/** Seconds per measurement of the benchmark, unless `?bench=<seconds>` says otherwise. */
const BENCH_SECONDS = 3;

start().catch((error) => {
  const loading = document.getElementById('loading')!;
  loading.hidden = false;
  loading.textContent = t('Failed to load: {error}', { error: String(error) });
  console.error(error);
});
