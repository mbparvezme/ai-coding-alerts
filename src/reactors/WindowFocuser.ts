import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Os } from "../platform/Platform";
import { buildFocusCommand } from "../platform/focusCommand";
import { CommandRunner } from "./SoundPlayer";

export class WindowFocuser implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly enabled: () => boolean,
    private readonly run: CommandRunner
  ) {}

  react(_alert: Alert): void {
    if (!this.enabled()) {
      return;
    }
    const command = buildFocusCommand(this.os);
    if (command) {
      this.run(command);
    }
  }
}
