import { Alert } from "../model/Alert";
import { AgentDetector } from "./AgentDetector";

export class DetectorRegistry {
  constructor(private readonly detectors: AgentDetector[]) {}

  detect(payload: unknown): Alert | undefined {
    const detector = this.detectors.find((d) => d.canHandle(payload));
    return detector?.parse(payload);
  }
}
