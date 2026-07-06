import { Alert } from "../model/Alert";
import { Reactor } from "../alert/Reactor";
import { Command, Os } from "../platform/Platform";
import { buildSoundCommand } from "../platform/soundCommand";

export type CommandRunner = (command: Command) => void;

export interface SoundConfig {
  resolvePath(): string | null;
}

export class SoundPlayer implements Reactor {
  constructor(
    private readonly os: Os,
    private readonly config: SoundConfig,
    private readonly run: CommandRunner
  ) {}

  react(_alert: Alert): void {
    this.play();
  }

  play(): void {
    const path = this.config.resolvePath();
    if (!path) {
      return;
    }
    this.run(buildSoundCommand(this.os, path));
  }
}
