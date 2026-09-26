import dgram from "node:dgram";

import { classifyBonjourError } from "./lifecycle.js";

const localNetworkProbeAddress = "224.0.0.251";
const localNetworkProbePort = 5353;
const localNetworkProbeTimeoutMs = 1_000;

type LocalNetworkProbeDependencies = {
  readonly createSocket?: typeof dgram.createSocket;
  readonly platform?: NodeJS.Platform;
};

export type LocalNetworkProbeResult = "allowed" | "blocked" | "unsupported";

export function mdnsProbeQuery(): Buffer {
  const labels = ["_difftray", "_tcp", "local"];
  const encodedLabels = labels.map((label) => {
    const value = Buffer.from(label, "ascii");
    return Buffer.concat([Buffer.from([value.length]), value]);
  });
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  const question = Buffer.alloc(5);
  question.writeUInt16BE(12, 1);
  question.writeUInt16BE(1, 3);

  return Buffer.concat([header, ...encodedLabels, question]);
}

export async function probeLocalNetworkAccess(
  dependencies: LocalNetworkProbeDependencies = {}
): Promise<LocalNetworkProbeResult> {
  const platform = dependencies.platform ?? process.platform;

  if (platform !== "darwin") {
    return "unsupported";
  }

  const createSocket = dependencies.createSocket ?? dgram.createSocket;

  return new Promise<LocalNetworkProbeResult>((resolve) => {
    let settled = false;
    let socket: dgram.Socket | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: Exclude<LocalNetworkProbeResult, "unsupported">): void => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      if (socket) {
        socket.removeListener("error", handleSocketError);

        try {
          socket.close();
        } catch {
          // The result is already known; closing an unbound failed socket is best effort.
        }
      }

      resolve(result);
    };

    const resultForError = (
      error: unknown
    ): Exclude<LocalNetworkProbeResult, "unsupported"> =>
      classifyBonjourError(error, platform) === "blocked" ? "blocked" : "allowed";

    function handleSocketError(error: Error): void {
      finish(resultForError(error));
    }

    try {
      socket = createSocket("udp4");
      socket.once("error", handleSocketError);
      timeout = setTimeout(() => {
        finish("allowed");
      }, localNetworkProbeTimeoutMs);
      timeout.unref();
      socket.connect(localNetworkProbePort, localNetworkProbeAddress, () => {
        if (settled || !socket) {
          return;
        }

        socket.send(mdnsProbeQuery(), (error) => {
          finish(error ? resultForError(error) : "allowed");
        });
      });
    } catch (error) {
      finish(resultForError(error));
    }
  });
}
