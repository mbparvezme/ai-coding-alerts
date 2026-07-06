import { Alert } from "../model/Alert";

export interface Reactor {
  react(alert: Alert): void | Promise<void>;
}
