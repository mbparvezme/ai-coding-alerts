import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Os } from "../platform/Platform";
import { buildNotifyCommand } from "../platform/notifyCommand";
import { CommandRunner } from "./SoundPlayer";

const TITLE = "AI Coding Alerts";

export class OsNotifier implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly enabled: () => boolean,
    private readonly run: CommandRunner
  ) {}

  react(alert: Alert): void {
    if (!this.enabled()) {
      return;
    }
    this.run(buildNotifyCommand(this.os, TITLE, alert.message));
  }
}
