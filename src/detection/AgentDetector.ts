import { Alert } from "../model/Alert";

export interface AgentDetector {
  readonly agent: string;
  canHandle(payload: unknown): boolean;
  parse(payload: unknown): Alert;
}
