import { newId } from "../util/id";

export type AlertStatus = "pending" | "approved" | "denied";

export interface Alert {
  id: string;
  agent: string;
  type: string;
  message: string;
  receivedAt: number;
  status: AlertStatus;
  respondedAt?: number;
}

export function createAlert(input: {
  agent: string;
  type: string;
  message: string;
  receivedAt?: number;
}): Alert {
  return {
    id: newId(),
    agent: input.agent,
    type: input.type,
    message: input.message,
    receivedAt: input.receivedAt ?? Date.now(),
    status: "pending"
  };
}
