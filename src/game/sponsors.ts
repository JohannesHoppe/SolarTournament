import { AD_SECONDS, SatireAds } from './satire-ads';
import { t } from '../i18n/i18n';
import { passOnClip } from '../view/clip';

/**
 * Sponsor breaks. In 2584 a Host's next clone only boots after the Host has watched an
 * advertisement. The ad comes from an AdProvider and stays inside its small slot; the button
 * to boot the clone appears once the ad has run. The button is separate from the ad, because
 * ad networks forbid rewarding clicks on the ads themselves. Around the ad the break reports
 * how the clone died, so the screen has content of its own.
 */
export interface AdProvider {
  /** Fills the slot with one ad; resolves once it has run long enough to count as watched. */
  render(slot: HTMLElement): Promise<void>;
  /** Stops what the ad still draws once the break is over (a hologram's frames). */
  stop?(): void;
}

/**
 * A clone's death takes RESPAWN_SECONDS before the next is printed; then a Host sits through
 * the sponsor break, whose ad runs AD_SECONDS before the clone can boot. The wait is the price
 * of dying. A bot's next clone waits as long as a Host's at the soonest, booted the moment the
 * button shows: BOT_RESPAWN_SECONDS.
 */
export const RESPAWN_SECONDS = 3;
export const BOT_RESPAWN_SECONDS = RESPAWN_SECONDS + AD_SECONDS;

/** The boot button appears after this long at the latest (ms), whatever the ad does. */
const AD_TIMEOUT_MS = 20000;
/** An ad blocker hides the slot by its name a moment after it shows (ms); then the check looks. */
const BLOCKER_CHECK_MS = 600;

const $ = (id: string) => document.getElementById(id)!;

export class SponsorBreak {
  private readonly root = $('sponsor');
  private readonly slot = $('ad-slot');
  private readonly status = $('sponsor-status');
  private readonly cause = $('sponsor-cause');
  private readonly report = $('sponsor-report');
  private readonly boot = $('sponsor-boot') as HTMLButtonElement;
  private readonly clipButton = $('sponsor-clip') as HTMLButtonElement;
  /** The clip on offer in this break: how it is recorded, and once it is, the video. */
  private clip: { record: () => Promise<Blob | null>; text: string; video: Blob | null } | null = null;
  /** Named so no blocker list knows it: it scolds the Host whose blocker hid even the satire. */
  private readonly conscience = $('conscience');
  private onDone: (() => void) | null = null;
  /** Counts breaks, so a late-finishing ad cannot unlock a newer break. */
  private generation = 0;

  constructor(private readonly ads: AdProvider = new SatireAds()) {
    this.boot.addEventListener('click', () => this.finish());
    this.clipButton.addEventListener('click', () => void this.onClip());
  }

  get visible() {
    return !this.root.hidden;
  }

  /**
   * Shows an ad; onDone runs when the Host boots the next clone after the ad has run. `cause`
   * names what killed the clone, `report` sums up the round so far.
   */
  show(cause: string | (string | Node)[], report: string, onDone: () => void) {
    const generation = ++this.generation;
    this.onDone = onDone;
    this.cause.replaceChildren(...(typeof cause === 'string' ? [cause] : cause));
    this.report.textContent = report;
    this.boot.hidden = true;
    this.status.textContent = t('Your next clone is being printed during this message');
    this.clip = null;
    this.clipButton.hidden = true;
    this.root.hidden = false;
    this.conscience.hidden = true;
    setTimeout(() => {
      if (generation === this.generation && this.visible) this.conscience.hidden = !this.adHidden();
    }, BLOCKER_CHECK_MS);
    // an ad that fails or never finishes must not keep the Host from the next clone
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, AD_TIMEOUT_MS));
    void Promise.race([this.ads.render(this.slot), timeout])
      .catch((error) => console.warn('Ad failed', error))
      .then(() => {
        if (generation !== this.generation || !this.visible) return;
        this.status.textContent = t('The sponsor is happy');
        this.boot.hidden = false;
        this.boot.focus();
      });
  }

  /**
   * Offers the kill cam's replay behind the ad as a clip: `record` records it (null where it
   * fails), `text` goes along when it is shared. The button records first and shares on its next
   * press: a share sheet only opens on a press of the Host's own, not seconds after one.
   */
  offerClip(record: () => Promise<Blob | null>, text: string) {
    this.clip = { record, text, video: null };
    this.clipButton.textContent = t('Save this death as a clip');
    this.clipButton.disabled = false;
    this.clipButton.hidden = false;
  }

  private async onClip() {
    const clip = this.clip;
    if (!clip) return;
    if (!clip.video) {
      this.clipButton.disabled = true;
      this.clipButton.textContent = t('Recording the clip');
      const video = await clip.record();
      // the break may be over, or another one begun, by the time the recording ends
      if (this.clip !== clip) return;
      this.clipButton.disabled = false;
      if (!video) {
        this.clipButton.hidden = true;
        return;
      }
      clip.video = video;
      this.clipButton.textContent = t('Share the clip');
      return;
    }
    const outcome = await passOnClip(clip.video, clip.text);
    if (this.clip === clip && outcome === 'saved') this.clipButton.textContent = t('Clip saved');
  }

  /**
   * Whether a blocker took the ad away: blockers hide the slot or the ad inside it by their
   * names (`display: none`) or remove them, and either way nothing of the ad has a size.
   */
  private adHidden() {
    const ad = this.slot.firstElementChild as HTMLElement | null;
    return !this.slot.isConnected || this.slot.offsetHeight === 0 || !ad || ad.offsetHeight === 0;
  }

  hide() {
    this.generation++;
    this.root.hidden = true;
    this.onDone = null;
    this.clip = null;
    this.ads.stop?.();
  }

  /** Boots the clone from keyboard or gamepad, once the ad has run. */
  confirm() {
    if (!this.boot.hidden) this.finish();
  }

  private finish() {
    const done = this.onDone;
    if (!done) return;
    this.hide();
    done();
  }
}
