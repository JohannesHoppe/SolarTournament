/**
 * Sponsor breaks. In 2584 a pilot's next clone only boots after the pilot has watched an
 * advertisement. The ad comes from an AdProvider; the button to boot the clone appears once
 * the ad has run. The button is separate from the ad, because ad networks forbid rewarding
 * clicks on the ads themselves.
 */
export interface AdProvider {
  /** Fills the slot with one ad; resolves once it has run long enough to count as watched. */
  render(slot: HTMLElement): Promise<void>;
}

/** Seconds the placeholder runs before the clone can boot. */
const PLACEHOLDER_SECONDS = 5;

/** Marks the ad slot until a real ad network is connected. */
export class PlaceholderAd implements AdProvider {
  render(slot: HTMLElement): Promise<void> {
    slot.replaceChildren();
    const label = document.createElement('span');
    label.className = 'ad-label';
    label.textContent = 'Advertisement';
    const text = document.createElement('strong');
    text.textContent = 'Real ads will appear here.';
    slot.append(label, text);
    return new Promise((resolve) => setTimeout(resolve, PLACEHOLDER_SECONDS * 1000));
  }
}

const $ = (id: string) => document.getElementById(id)!;

export class SponsorBreak {
  private readonly root = $('sponsor');
  private readonly slot = $('ad-slot');
  private readonly status = $('sponsor-status');
  private readonly boot = $('sponsor-boot') as HTMLButtonElement;
  private onDone: (() => void) | null = null;
  /** Counts breaks, so a late-finishing ad cannot unlock a newer break. */
  private generation = 0;

  constructor(private readonly ads: AdProvider = new PlaceholderAd()) {
    this.boot.addEventListener('click', () => this.finish());
  }

  get visible() {
    return !this.root.hidden;
  }

  /** Shows an ad; onDone runs when the pilot boots the next clone after the ad has run. */
  show(onDone: () => void) {
    const generation = ++this.generation;
    this.onDone = onDone;
    this.boot.hidden = true;
    this.status.textContent = 'Your next clone is being printed during this message';
    this.root.hidden = false;
    void this.ads.render(this.slot).then(() => {
      if (generation !== this.generation || !this.visible) return;
      this.status.textContent = 'The sponsor is happy';
      this.boot.hidden = false;
      this.boot.focus();
    });
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
