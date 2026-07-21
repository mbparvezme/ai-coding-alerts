type Schedule = (fn: () => void, ms: number) => unknown;
type Cancel = (handle: unknown) => void;

export interface EscalationConfig {
  repeatMs(): number;
  maxRepeats(): number;
}

export class Escalator {
  private handle: unknown;
  private remaining = 0;
  private ring: () => void = () => {};

  constructor(
    private readonly config: EscalationConfig,
    private readonly schedule: Schedule = (fn, ms) => setTimeout(fn, ms),
    private readonly cancelScheduled: Cancel = (h) => clearTimeout(h as NodeJS.Timeout)
  ) {}

  begin(ring: () => void): void {
    this.cancel();
    const interval = this.config.repeatMs();
    if (interval <= 0 || this.config.maxRepeats() <= 0) {
      return;
    }
    this.ring = ring;
    this.remaining = this.config.maxRepeats();
    this.tick(interval);
  }

  cancel(): void {
    if (this.handle !== undefined) {
      this.cancelScheduled(this.handle);
      this.handle = undefined;
    }
    this.remaining = 0;
  }

  private tick(interval: number): void {
    this.handle = this.schedule(() => {
      this.handle = undefined;
      if (this.remaining <= 0) {
        return;
      }
      this.remaining -= 1;
      this.ring();
      if (this.remaining > 0) {
        this.tick(interval);
      }
    }, interval);
  }
}
