import { describe, expect, it } from 'vitest';
import { BOT_RESPAWN_SECONDS, RESPAWN_SECONDS } from './sponsors';
import { AD_SECONDS } from './satire-ads';
import { REPLAY_SECONDS } from '../view/killcam';

describe('the wait for the next clone', () => {
  it('a bot waits as long as a Host who boots the moment the ad has run', () => {
    expect(BOT_RESPAWN_SECONDS).toBe(RESPAWN_SECONDS + AD_SECONDS);
  });

  it('a Host who watches the kill cam to its end loses no time to a bot: the sponsor break waits for it', () => {
    expect(REPLAY_SECONDS).toBeLessThanOrEqual(RESPAWN_SECONDS + 1e-9);
  });
});
