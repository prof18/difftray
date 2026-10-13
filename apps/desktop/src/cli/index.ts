import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  EXIT_USAGE,
  EXIT_NOT_AVAILABLE,
  EXIT_CONFLICT,
  EXIT_IO,
  EXIT_INTERNAL
} from "../shared/agent-protocol.js";
import { parseCliArguments, CliUsageError } from "./commands.js";
import { resolveAgentRuntime } from "./agent-runtime.js";
import { connectAgent } from "./agent-connection.js";
import { sendAgentRequest } from "./agent-client.js";

const help = `Difftray local review CLI
Usage: difftray open [PATH] [--target working-tree|branch|commit] [--base REF|--commit REF] [--json]
       difftray review inspect [--repo PATH] [--target selected|working-tree|branch|commit]
       difftray review files|file|feedback|export --context ID
       difftray feedback submit --context ID --input FILE_OR_STDIN
       difftray doctor [--json]
       difftray --help | --version [--json]
`;
function exitCode(error: AgentProtocolError): number {
  if (["invalid_request", "invalid_target"].includes(error.code)) return EXIT_USAGE;
  if (
    [
      "stale_review",
      "stale_diff",
      "stale_feedback",
      "note_conflict",
      "idempotency_conflict"
    ].includes(error.code)
  )
    return EXIT_CONFLICT;
  if (["repository_missing", "limit_exceeded", "request_timeout"].includes(error.code))
    return EXIT_IO;
  return error.code === "internal_error" ? EXIT_INTERNAL : EXIT_NOT_AVAILABLE;
}
// The fixed bundled entry point is Node-only: never import Electron's GUI process.
async function main() {
  const command = parseCliArguments(process.argv.slice(2));
  if (command.kind === "help") {
    process.stdout.write(help);
    return;
  }
  if (command.kind === "version") {
    const metadata = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    ) as { version: string };
    process.stdout.write(
      command.json
        ? `${JSON.stringify({ appVersion: metadata.version, protocolVersion: CLI_PROTOCOL_VERSION, cwd: process.cwd(), runtime: process.versions })}\n`
        : `Difftray ${metadata.version} (CLI protocol ${String(CLI_PROTOCOL_VERSION)})\n`
    );
    return;
  }
  if (command.kind === "schema" || command.kind === "feedback.submit")
    throw new CliUsageError("This operation is not available in this build.");
  if (command.kind === "doctor" && command.appPath)
    throw new CliUsageError("Run the CLI inside the desired application bundle.");
  const runtime = await resolveAgentRuntime();
  const endpoint = await connectAgent(runtime);
  let response;
  switch (command.kind) {
    case "doctor":
      response = await sendAgentRequest(endpoint, "hello", {});
      break;
    case "open":
      response = await sendAgentRequest(endpoint, "open", {
        repoPath: command.repoPath,
        selector: command.selector
      });
      break;
    case "review.inspect":
      response = await sendAgentRequest(endpoint, "review.inspect", {
        repoPath: command.repoPath,
        selector: command.selector
      });
      break;
    case "review.files":
      response = await sendAgentRequest(endpoint, "review.files", {
        contextId: command.contextId,
        limit: command.limit,
        ...(command.cursor ? { cursor: command.cursor } : {})
      });
      break;
    case "review.file":
      response = await sendAgentRequest(endpoint, "review.file", {
        contextId: command.contextId,
        path: command.path
      });
      break;
    case "review.feedback":
      response = await sendAgentRequest(endpoint, "review.feedback", {
        contextId: command.contextId,
        limit: command.limit,
        includeInactive: command.includeInactive,
        ...(command.cursor ? { cursor: command.cursor } : {})
      });
      break;
    case "review.export": {
      let contextId;
      if ("contextId" in command) contextId = command.contextId;
      else {
        const inspected = await sendAgentRequest(endpoint, "review.inspect", {
          repoPath: command.repoPath,
          selector: command.selector
        });
        if (!inspected.ok) {
          response = inspected;
          break;
        }
        contextId = inspected.result.contextId;
      }
      response = await sendAgentRequest(endpoint, "review.export", {
        contextId,
        format: command.format
      });
      break;
    }
  }
  if (!response.ok) {
    if (command.json) process.stdout.write(`${JSON.stringify(response)}\n`);
    process.stderr.write(`${response.error.code}: ${response.error.message}\n`);
    process.exitCode = exitCode(
      new AgentProtocolError(response.error.code, response.error.message)
    );
    return;
  }
  if (command.kind === "open" && !command.json && "repoPath" in response.result)
    process.stdout.write(`Opened ${response.result.repoPath}\n`);
  else if (
    command.kind === "review.export" &&
    command.format === "prompt" &&
    "content" in response.result &&
    typeof response.result.content === "string"
  )
    process.stdout.write(`${response.result.content}\n`);
  else process.stdout.write(`${JSON.stringify(response)}\n`);
}
void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  if (error instanceof CliUsageError) {
    process.stderr.write(help);
    process.exitCode = EXIT_USAGE;
  } else if (error instanceof AgentProtocolError) {
    if (process.argv.includes("--json"))
      process.stdout.write(
        `${JSON.stringify({ version: CLI_PROTOCOL_VERSION, id: randomUUID(), ok: false, error: { code: error.code, message: error.message, retryable: error.code === "busy" || error.code === "request_timeout" } })}\n`
      );
    process.exitCode = exitCode(error);
  } else process.exitCode = EXIT_INTERNAL;
});
