// src/permission/modeSelect.ts
export type Broker = "managed" | "diy" | "native";

export interface ModeInputs {
  isPro: boolean;
  linked: boolean;
  preferManaged: boolean;
  diyConfigured: boolean;
}

export function selectBroker(i: ModeInputs): Broker {
  if (i.isPro && i.linked && i.preferManaged) return "managed";
  if (i.diyConfigured) return "diy";
  return "native";
}
