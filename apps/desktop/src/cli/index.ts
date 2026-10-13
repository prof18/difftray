import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { CLI_PROTOCOL_VERSION } from "../shared/agent-protocol.js";

// The fixed bundled entry point is Node-only: never import Electron's GUI process.
try {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      json: { type: "boolean" }
    }
  });
  const metadata = JSON.parse(
    readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
  ) as { version: string };
  if (values.version) {
    process.stdout.write(
      values.json
        ? `${JSON.stringify({ appVersion: metadata.version, protocolVersion: CLI_PROTOCOL_VERSION, cwd: process.cwd(), runtime: process.versions })}\n`
        : `Difftray ${metadata.version} (CLI protocol ${String(CLI_PROTOCOL_VERSION)})\n`
    );
  } else {
    process.stdout.write(
      "Difftray local review CLI\nUsage: difftray --help | --version [--json]\n"
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
