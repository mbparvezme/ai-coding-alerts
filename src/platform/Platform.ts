export type Os = "darwin" | "linux" | "win32";

export interface Command {
  command: string;
  args: string[];
}

export function currentOs(): Os {
  return process.platform as Os;
}
