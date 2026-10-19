import { loadAssets } from './assets';
import { Sound } from './audio';
import { Game } from './game';

async function start() {
  const loading = document.getElementById('loading')!;
  if (!document.createElement('canvas').getContext('webgl2')) {
    loading.hidden = true;
    document.getElementById('no-webgl')!.hidden = false;
    return;
  }

  const sound = new Sound();
  const assets = await loadAssets(sound.context);
  sound.setBuffers(assets.sounds);
  loading.hidden = true;

  const game = new Game(document.getElementById('game')!, assets, sound);
  if (import.meta.env.DEV) Object.assign(window, { game });
}

start().catch((error) => {
  document.getElementById('loading')!.textContent = 'Failed to load: ' + error;
  console.error(error);
});
