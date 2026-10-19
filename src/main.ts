import { loadAssets } from './assets';
import { Sound } from './sound/audio';
import { Game } from './game/game';

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

  const game = new Game(document.getElementById('game')!, assets, sound);
  // the loading screen stays until the game stands, so a failure still has a place to show
  loading.hidden = true;
  if (import.meta.env.DEV) Object.assign(window, { game });
}

start().catch((error) => {
  const loading = document.getElementById('loading')!;
  loading.hidden = false;
  loading.textContent = 'Failed to load: ' + error;
  console.error(error);
});
