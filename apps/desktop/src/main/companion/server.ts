import { createServer, type Server as HttpServer } from "node:http";

import {
  COMPANION_PROTOCOL_VERSION,
  type CompanionServerEvent,
  type EncryptedEnvelope
} from "@difftray/companion-protocol";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { createCompanionApi, type CompanionDeps } from "./api.js";
import { createCompanionRouter } from "./router.js";

export type CompanionServer = {
  readonly broadcast: (event: CompanionServerEvent) => void;
  readonly revokeDevice: (deviceId: string) => void;
  readonly start: (preferredPort: number) => Promise<{ readonly port: number }>;
  readonly stop: () => Promise<void>;
};

type ConnectedSocket = {
  readonly deviceId: string;
  readonly devicePublicKey: string;
  readonly socket: WebSocket;
};

const webSocketAuthTimeoutMs = 5_000;

export function createCompanionServer(deps: CompanionDeps): CompanionServer {
  const router = createCompanionRouter(createCompanionApi(deps), deps.companionEnvelope);
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
      let connected: ConnectedSocket | undefined;
      const authTimeout = setTimeout(() => {
        closeUnauthorized(webSocket);
      }, webSocketAuthTimeoutMs);

      webSocket.once("close", () => {
        clearTimeout(authTimeout);

        if (connected) {
          sockets.delete(connected);
        }
      });
      webSocket.once("message", (data) => {
        const envelope = readWebSocketEnvelope(data);

        if (!envelope.ok) {
          closeUnauthorized(webSocket);
          return;
        }

        const verified = deps.companionEnvelope.verifyWebSocketAuthEnvelope(
          envelope.value
        );

        if (!verified.ok) {
          closeUnauthorized(webSocket);
          return;
        }

        clearTimeout(authTimeout);
        connected = {
          deviceId: verified.device.deviceId,
          devicePublicKey: verified.device.devicePublicKey,
          socket: webSocket
        };
        sockets.add(connected);
        sendWebSocketBody(deps, webSocket, verified.device.devicePublicKey, {
          kind: "hello",
          protocolVersion: COMPANION_PROTOCOL_VERSION,
          serverName: deps.serverIdentity().serverName
        });
        webSocket.on("message", (message) => {
          handleAuthenticatedWebSocketMessage(
            deps,
            webSocket,
            verified.device.devicePublicKey,
            message
          );
        });
      });
    });
  });

  return {
    broadcast: (event) => {
      for (const { devicePublicKey, socket } of sockets) {
        sendWebSocketBody(deps, socket, devicePublicKey, event);
      }
    },
    revokeDevice: (deviceId) => {
      for (const connected of sockets) {
        if (connected.deviceId !== deviceId) {
          continue;
        }

        sendWebSocketBody(deps, connected.socket, connected.devicePublicKey, {
          kind: "device_revoked"
        });
        sockets.delete(connected);
        connected.socket.close(1008, "Device revoked");
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

function handleAuthenticatedWebSocketMessage(
  deps: CompanionDeps,
  socket: WebSocket,
  devicePublicKey: string,
  data: RawData
): void {
  const envelope = readWebSocketEnvelope(data);

  if (!envelope.ok) {
    closeUnauthorized(socket);
    return;
  }

  const opened = deps.companionEnvelope.openWebSocketClientEnvelope({
    devicePublicKey,
    envelope: envelope.value
  });

  if (!opened.ok) {
    closeUnauthorized(socket);
    return;
  }

  if (isWebSocketPing(opened.body)) {
    sendWebSocketBody(deps, socket, devicePublicKey, { kind: "pong" });
  }
}

function sendWebSocketBody(
  deps: CompanionDeps,
  socket: WebSocket,
  devicePublicKey: string,
  body: CompanionServerEvent | { readonly kind: "pong" }
): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(
    JSON.stringify(
      deps.companionEnvelope.sealWebSocketEnvelope({
        body,
        devicePublicKey
      })
    )
  );
}

function readWebSocketEnvelope(
  data: RawData
): { readonly ok: true; readonly value: EncryptedEnvelope } | { readonly ok: false } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(webSocketDataToString(data)) as unknown;
  } catch {
    return { ok: false };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false };
  }

  const envelope = parsed as Partial<EncryptedEnvelope>;

  if (
    envelope.v !== 1 ||
    typeof envelope.devicePk !== "string" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.box !== "string"
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      box: envelope.box,
      devicePk: envelope.devicePk,
      nonce: envelope.nonce,
      v: 1
    }
  };
}

function webSocketDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}

function isWebSocketPing(input: unknown): input is { readonly kind: "ping" } {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as Record<string, unknown>).kind === "ping"
  );
}

function closeUnauthorized(socket: WebSocket): void {
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close(1008, "Unauthorized");
  }
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
