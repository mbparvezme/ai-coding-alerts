export type Choice = "approve" | "deny" | "remember" | "mute";

const CHOICES = new Set<Choice>(["approve", "deny", "remember", "mute"]);

export function encodeCallback(id: string, choice: Choice): string {
  return `v1:${id}:${choice}`;
}

export function parseCallback(data: string): { id: string; choice: Choice } | null {
  const parts = data.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }
  const [, id, choice] = parts;
  if (!id || !CHOICES.has(choice as Choice)) {
    return null;
  }
  return { id, choice: choice as Choice };
}
