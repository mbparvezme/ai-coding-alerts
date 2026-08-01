export interface PermissionInfo {
  agent: string;
  tool: string;
  command: string;
}

export class AllowRules {
  private readonly keys = new Set<string>();

  static key(i: PermissionInfo): string {
    const command = i.command.trim().replace(/\s+/g, " ");
    return `${i.agent}|${i.tool}|${command}`;
  }

  remember(i: PermissionInfo): void {
    this.keys.add(AllowRules.key(i));
  }

  matches(i: PermissionInfo): boolean {
    return this.keys.has(AllowRules.key(i));
  }

  clear(): void {
    this.keys.clear();
  }
}
