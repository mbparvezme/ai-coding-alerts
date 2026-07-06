const BUILT_IN = new Set(["chime", "ping", "knock", "alarm"]);

export function resolveSoundPath(
  settings: { sound: string; customSoundPath: string },
  mediaRoot: string
): string | null {
  if (settings.sound === "custom") {
    return settings.customSoundPath.trim() ? settings.customSoundPath : null;
  }
  if (BUILT_IN.has(settings.sound)) {
    return `${mediaRoot}/sounds/${settings.sound}.wav`;
  }
  return null;
}
