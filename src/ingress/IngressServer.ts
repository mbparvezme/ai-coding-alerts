import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";

type PayloadHandler = (payload: unknown) => void;

export class IngressServer {
  private server: Server | undefined;

  constructor(private readonly onPayload: PayloadHandler) {}

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this.handle(req, res));
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", reject);
        this.server = server;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = undefined;
    });
  }

  port(): number {
    const address = this.server?.address();
    return address && typeof address === "object" ? address.port : 0;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "POST" || req.url !== "/alert") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        this.onPayload(payload);
        res.writeHead(202).end();
      } catch {
        res.writeHead(400).end();
      }
    });
  }
}
