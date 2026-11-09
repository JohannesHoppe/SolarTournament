import { msg } from '../i18n/i18n';
import type { ArenaId } from '../world/arenas';

/**
 * The Gullet's trade (docs/campaign/STORY.md, "The Gullet"): Kesh's book of bets on the Host's own
 * time trials, the rumors she sells for a drink, and the Pit downstairs. Only in the campaign.
 *
 * A bet: a stake of BET_STAKES on a job with a gold time, done before; the stake leaves the wallet
 * when it is placed, and the job flown again within its gold time pays it back BET_ODDS times;
 * flown slower, or left unflown for another job, the book keeps it. One bet at a time.
 */
export const BET_STAKES: readonly number[] = [100, 250, 500, 1000];
export const BET_ODDS = 2;

/**
 * A rumor costs RUMOR_PRICE (a drink for Kesh): it opens a side job under Rask's counter (a
 * smuggling run, a bounty) before its people would trust the Host with it, the first of RUMORS
 * still shut, each with Kesh's word on it.
 */
export const RUMOR_PRICE = 60;

/** The rumors in the order Kesh tells them: the job each opens, by its place and kind, and her word on it (shown, never spoken). */
export const RUMORS: readonly { place: ArenaId; job: 'smuggle' | 'bounty2' | 'bounty3'; word: string }[] = [
  { place: 'occator', job: 'smuggle', word: msg('A Rockborn family on the third step needs cargo nobody counts. I told them you don’t count either.') },
  { place: 'rheasilvia', job: 'smuggle', word: msg('The claims on Vesta pay for filters the Ministry says they don’t need. Somebody has to fly them in.') },
  { place: 'occator', job: 'bounty2', word: msg('The Dowager drinks here on Sundays. Not this Sunday. She owes everyone.') },
  { place: 'phobos', job: 'smuggle', word: msg('The Navy town under Mars runs on what isn’t on the manifest. Ask for the quartermaster. Don’t ask his name.') },
  { place: 'callisto', job: 'smuggle', word: msg('Lanes Watch films the bandits. Nobody films the medicine runs. That’s the point.') },
  { place: 'rheasilvia', job: 'bounty2', word: msg('Scrapjaw sawed a rig with a family still on it. The Rockborn will pay you to make it right.') },
  { place: 'titan', job: 'smuggle', word: msg('The Circuit’s pit crews want parts the sponsors don’t sell. Titan’s haze hides a lot.') },
  { place: 'europa', job: 'smuggle', word: msg('The science outfit under the ice needs things their grant forgot. They pay in favors and in coins.') },
];

/**
 * The Pit, downstairs (docs/campaign/STORY.md, "The Pit"): no licence, no Ministry. Wave after wave
 * of the Pit's fighters, every one against the Host, until the clone stays down; one clone a
 * night. Wave n brings min(n, PIT_MOST) fighters of skill min(PIT_SKILL + n · PIT_STEP, PIT_TOP);
 * each wave cleared pays PIT_PURSE cash from Kesh's purse, no cut taken. The most waves a night
 * are the Pit's record, kept in the browser.
 */
export const PIT_MOST = 5;
export const PIT_SKILL = 0.3;
export const PIT_STEP = 0.06;
export const PIT_TOP = 0.85;
export const PIT_PURSE = 150;

/** A wave of the Pit: how many fighters and how good. */
export const pitWave = (wave: number) => ({ count: Math.min(wave, PIT_MOST), skill: Math.min(PIT_SKILL + wave * PIT_STEP, PIT_TOP) });
