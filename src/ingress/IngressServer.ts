import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";

type PayloadHandler = (payload: unknown) => void;

export interface PermissionRoutes {
  create(payload: unknown): Promise<{ id: string }> | { id: string };
  decision(id: string): { status: string };
}

export class IngressServer {
  private server: Server | undefined;

  constructor(
    private readonly onPayload: PayloadHandler,
    private readonly permission?: PermissionRoutes
  ) {}

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
    const url = req.url ?? "";
    if (req.method === "POST" && url === "/alert") {
      this.readBody(req, (payload) => {
        if (payload === undefined) {
          res.writeHead(400).end();
          return;
        }
        this.onPayload(payload);
        res.writeHead(202).end();
      });
      return;
    }
    if (this.permission && req.method === "POST" && url === "/permission") {
      this.readBody(req, async (payload) => {
        if (payload === undefined) {
          res.writeHead(400).end();
          return;
        }
        try {
          const { id } = await this.permission!.create(payload);
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id }));
        } catch {
          res.writeHead(500).end();
        }
      });
      return;
    }
    if (this.permission && req.method === "GET" && url.startsWith("/decision/")) {
      const id = decodeURIComponent(url.slice("/decision/".length));
      const { status } = this.permission.decision(id);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status }));
      return;
    }
    res.writeHead(404).end();
  }

  private readBody(req: IncomingMessage, done: (payload: unknown) => void): void {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        done(JSON.parse(body || "{}"));
      } catch {
        done(undefined);
      }
    });
  }
}
