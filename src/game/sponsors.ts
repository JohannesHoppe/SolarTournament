import { SatireAds } from './satire-ads';

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
}

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
  /** Named so no blocker list knows it: it scolds the Host whose blocker hid even the satire. */
  private readonly conscience = $('conscience');
  private onDone: (() => void) | null = null;
  /** Counts breaks, so a late-finishing ad cannot unlock a newer break. */
  private generation = 0;

  constructor(private readonly ads: AdProvider = new SatireAds()) {
    this.boot.addEventListener('click', () => this.finish());
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
    this.status.textContent = 'Your next clone is being printed during this message';
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
        this.status.textContent = 'The sponsor is happy';
        this.boot.hidden = false;
        this.boot.focus();
      });
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
