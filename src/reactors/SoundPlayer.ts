import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Command, Os } from "../platform/Platform";
import { buildSoundCommand } from "../platform/soundCommand";

export type CommandRunner = (command: Command) => void;

export interface SoundConfig {
  resolvePath(alertType: string): string | null;
}

export class SoundPlayer implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly config: SoundConfig,
    private readonly run: CommandRunner,
    private readonly muted: () => boolean = () => false
  ) {}

  react(alert: Alert): void {
    if (this.muted()) {
      return;
    }
    this.play(alert.type);
  }

  play(alertType: string): void {
    const path = this.config.resolvePath(alertType);
    if (!path) {
      return;
    }
    this.run(buildSoundCommand(this.os, path));
  }
}
