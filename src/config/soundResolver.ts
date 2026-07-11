const BUILT_IN = new Map([
  ["chime", "chime.wav"],
  ["ping", "ping.wav"],
  ["knock", "knock.wav"],
  ["alarm", "alarm.wav"],
  ["drop", "drop.mp3"],
  ["frog", "frog.mp3"],
  ["swip", "swip.mp3"],
  ["wire", "wire.mp3"]
]);

export interface SoundChoice {
  sound: string;
  customSoundPath: string;
  enabled: boolean;
}

export interface SoundChoices {
  popup: SoundChoice;
  finished: SoundChoice;
}

export function soundChoiceFor(alertType: string, choices: SoundChoices): SoundChoice {
  return alertType === "completion" ? choices.finished : choices.popup;
}

export function resolveSoundPath(
  settings: { sound: string; customSoundPath: string },
  mediaRoot: string
): string | null {
  if (settings.sound === "custom") {
    return settings.customSoundPath.trim() ? settings.customSoundPath : null;
  }
  const file = BUILT_IN.get(settings.sound);
  return file ? `${mediaRoot}/sounds/${file}` : null;
}
