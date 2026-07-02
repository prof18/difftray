import { createServer, type Server as HttpServer } from "node:http";

import { type CompanionServerEvent } from "@difftray/companion-protocol";
import { WebSocketServer, type WebSocket } from "ws";

import { createCompanionApi, type CompanionDeps } from "./api.js";
import { createCompanionRouter } from "./router.js";

export type CompanionServer = {
  readonly broadcast: (event: CompanionServerEvent) => void;
  readonly start: (preferredPort: number) => Promise<{ readonly port: number }>;
  readonly stop: () => Promise<void>;
};

type ConnectedSocket = {
  readonly devicePk: string;
  readonly socket: WebSocket;
};

export function createCompanionServer(deps: CompanionDeps): CompanionServer {
  const router = createCompanionRouter(createCompanionApi(deps));
  const httpServer = createServer((request, response) => {
    void router(request, response);
  });
  const webSocketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<ConnectedSocket>();

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url !== "/companion/v1/events") {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      const connected = {
        devicePk: "",
        socket: webSocket
      };
      sockets.add(connected);
      webSocket.once("close", () => {
        sockets.delete(connected);
      });
    });
  });

  return {
    broadcast: (event) => {
      const serialized = JSON.stringify(event);

      for (const { socket } of sockets) {
        socket.send(serialized);
      }
    },
    start: (preferredPort) =>
      new Promise((resolve, reject) => {
        const onError = (error: Error): void => {
          httpServer.off("listening", onListening);
          reject(error);
        };
        const onListening = (): void => {
          httpServer.off("error", onError);
          const address = httpServer.address();

          if (!address || typeof address === "string") {
            reject(new Error("Companion server did not bind to a TCP port"));
            return;
          }

          resolve({ port: address.port });
        };

        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(preferredPort, preferredPort === 0 ? "127.0.0.1" : "0.0.0.0");
      }),
    stop: async () => {
      for (const { socket } of sockets) {
        socket.close();
      }
      sockets.clear();

      await closeWebSocketServer(webSocketServer);
      await closeHttpServer(httpServer);
    }
  };
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
