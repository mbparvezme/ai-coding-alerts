import { Alert } from "../model/Alert";
import { Reactor } from "./Reactor";

type ErrorHandler = (reactor: Reactor, error: unknown) => void;

export class AlertBus {
  constructor(
    private readonly reactors: Reactor[],
    private readonly onError: ErrorHandler = () => {}
  ) {}

  async emit(alert: Alert): Promise<void> {
    for (const reactor of this.reactors) {
      try {
        await reactor.react(alert);
      } catch (error) {
        this.onError(reactor, error);
      }
    }
  }
}
