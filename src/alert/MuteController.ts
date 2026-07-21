const INDEFINITE = Number.POSITIVE_INFINITY;

export class MuteController {
  private mutedUntil = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  isMuted(): boolean {
    if (this.mutedUntil === 0) {
      return false;
    }
    if (this.mutedUntil !== INDEFINITE && this.now() >= this.mutedUntil) {
      this.mutedUntil = 0;
      return false;
    }
    return true;
  }

  muteFor(ms: number): void {
    this.mutedUntil = this.now() + ms;
  }

  muteIndefinitely(): void {
    this.mutedUntil = INDEFINITE;
  }

  unmute(): void {
    this.mutedUntil = 0;
  }
}
