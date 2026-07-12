import { Alert } from "../model/Alert";

type Schedule = (fn: () => void, ms: number) => unknown;
type Cancel = (handle: unknown) => void;

export class CompletionDebouncer {
  private pending: unknown;

  constructor(
    private readonly delayMs: () => number,
    private readonly emit: (alert: Alert) => void,
    private readonly schedule: Schedule = (fn, ms) => setTimeout(fn, ms),
    private readonly cancelScheduled: Cancel = (h) => clearTimeout(h as NodeJS.Timeout)
  ) {}

  push(alert: Alert): void {
    this.cancel();
    if (alert.type !== "completion") {
      this.emit(alert);
      return;
    }
    const delay = this.delayMs();
    if (delay <= 0) {
      this.emit(alert);
      return;
    }
    this.pending = this.schedule(() => {
      this.pending = undefined;
      this.emit(alert);
    }, delay);
  }

  private cancel(): void {
    if (this.pending !== undefined) {
      this.cancelScheduled(this.pending);
      this.pending = undefined;
    }
  }
}
