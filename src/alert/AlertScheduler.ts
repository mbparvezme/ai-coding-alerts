import { Alert } from "../model/Alert";

type Schedule = (fn: () => void, ms: number) => unknown;
type Cancel = (handle: unknown) => void;

export interface AlertDelays {
  popupMs(): number;
  finishedMs(): number;
}

export class AlertScheduler {
  private pendingPopup: unknown;
  private pendingCompletion: unknown;

  constructor(
    private readonly delays: AlertDelays,
    private readonly emit: (alert: Alert) => void,
    private readonly schedule: Schedule = (fn, ms) => setTimeout(fn, ms),
    private readonly cancelScheduled: Cancel = (h) => clearTimeout(h as NodeJS.Timeout)
  ) {}

  push(alert: Alert): void {
    this.clearCompletion();
    if (alert.type === "activity") {
      this.clearPopup();
      return;
    }
    if (alert.type === "completion") {
      this.pendingCompletion = this.hold(alert, this.delays.finishedMs(), () => this.clearCompletion());
      return;
    }
    this.clearPopup();
    this.pendingPopup = this.hold(alert, this.delays.popupMs(), () => this.clearPopup());
  }

  private hold(alert: Alert, delay: number, clear: () => void): unknown {
    if (delay <= 0) {
      this.emit(alert);
      return undefined;
    }
    return this.schedule(() => {
      clear();
      this.emit(alert);
    }, delay);
  }

  private clearPopup(): void {
    if (this.pendingPopup !== undefined) {
      this.cancelScheduled(this.pendingPopup);
      this.pendingPopup = undefined;
    }
  }

  private clearCompletion(): void {
    if (this.pendingCompletion !== undefined) {
      this.cancelScheduled(this.pendingCompletion);
      this.pendingCompletion = undefined;
    }
  }
}
