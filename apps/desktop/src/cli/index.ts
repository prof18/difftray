import { readFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import {
  AgentProtocolError,
  CLI_PROTOCOL_VERSION,
  type AgentResponse
} from "../shared/agent-protocol.js";
import { parseCliArguments, CliUsageError } from "./commands.js";
import { resolveAgentRuntime } from "./agent-runtime.js";
import { connectAgent } from "./agent-connection.js";
import { sendAgentRequest } from "./agent-client.js";
import { withSubmissionInput } from "./submission-input.js";
import { runDoctor } from "./diagnostics.js";
import {
  cliExitCode,
  cliErrorResponse,
  formatCliResponse,
  wantsJsonOutput,
  writeCliText
} from "./output.js";

const help = `Difftray local review CLI
Usage: difftray open [PATH] [--target working-tree|branch|commit] [--base REF|--commit REF] [--json]
       difftray review inspect [--repo PATH] [--target selected|working-tree|branch|commit]
       difftray review files|file|feedback|export --context ID
       difftray feedback submit --context ID --input FILE_OR_STDIN [--request-id ID] [--json]
       difftray doctor [--app OWN_BUNDLE_PATH] [--json]
       difftray --help | --version [--json]

Review scopes: overall notes, file comments, and side-aware line/range comments.
open defaults to the current directory and working-tree target.
inspect/export default to the current directory and selected target (working-tree
for a newly opened repository). Explicit branch needs --base; commit needs --commit.
export accepts --context ID or --repo PATH with selectors, never both.
export defaults to --format prompt: exact report text on stdout. --json or
--format json returns an envelope; errors are diagnostics on stderr.
files/feedback accept --limit (default 100, maximum 500) and --cursor.
feedback --include-inactive includes retained historical comments.
Contexts expire after 24 hours; stale code requires fresh inspection. A stale
feedback cursor requires restarting feedback pagination under the same context.
Reads preserve feedback and the context's generated-file visibility setting.
JSON preserves available author attribution. Agent names are labels, not identities.
submit reads a JSON document (maximum 1 MiB; use --input - for stdin) containing
actor {name, runId}, requestId and items. An optional --request-id must agree with
the document requestId if present. Bodies are supplied only in JSON input.
Access is local-only using the current OS user's private desktop endpoint.
This launcher always uses its own app bundle, including after relocation.
doctor reports that bundle, profile, CLI version and startup/connection result.
The portable skill resolver prefers /Applications/Difftray.app then
~/Applications/Difftray.app; DIFFTRAY_APP_PATH explicitly selects custom/Alpha apps.
DIFFTRAY_USER_DATA_DIR explicitly selects an isolated profile for this bundle.
Callers must obtain user authorization for repository access and feedback actions.
Exit codes: 1 internal, 2 input, 3 unavailable/not found/protocol,
4 stale state/conflict, 5 transport/timeout/limit.
`;
// The fixed bundled entry point is Node-only: never import Electron's GUI process.
async function main() {
  const command = parseCliArguments(process.argv.slice(2));
  if (command.kind === "help") {
    await writeCliText(process.stdout, help);
    return;
  }
  if (command.kind === "version") {
    const metadata = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    ) as { version: string };
    await writeCliText(
      process.stdout,
      command.json
        ? `${JSON.stringify({ appVersion: metadata.version, cliVersion: metadata.version, bundlePath: path.dirname(path.dirname(path.dirname(process.execPath))), protocolVersion: CLI_PROTOCOL_VERSION, cwd: process.cwd(), runtime: process.versions })}\n`
        : `Difftray ${metadata.version} (CLI protocol ${String(CLI_PROTOCOL_VERSION)})\n`
    );
    return;
  }
  if (command.kind === "schema")
    throw new CliUsageError("This operation is not available in this build.");
  if (command.kind === "feedback.submit") {
    const response = await withSubmissionInput(command, async (params) => {
      const runtime = await resolveAgentRuntime();
      const endpoint = await connectAgent(runtime);
      return sendAgentRequest(endpoint, "feedback.submit", params);
    });
    await displayResponse(command, response);
    return;
  }
  const runtime = await resolveAgentRuntime();
  if (command.kind === "doctor") {
    if (
      command.appPath &&
      (await realpath(command.appPath)) !==
        path.dirname(path.dirname(path.dirname(runtime.executablePath)))
    )
      throw new CliUsageError(
        "Run the CLI inside the desired application bundle; --app must match this launcher’s bundle."
      );
    const diagnostic = await runDoctor(runtime, async () => {
      const endpoint = await connectAgent(runtime);
      const hello = await sendAgentRequest(endpoint, "hello", {});
      if (!hello.ok) throw new AgentProtocolError(hello.error.code, hello.error.message);
      return hello.result;
    });
    await displayResponse(command, diagnostic);
    return;
  }
  const endpoint = await connectAgent(runtime);
  let response;
  switch (command.kind) {
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
  await displayResponse(command, response);
}

async function displayResponse(
  command: Exclude<
    ReturnType<typeof parseCliArguments>,
    { kind: "help" | "schema" | "version" }
  >,
  response: AgentResponse | Awaited<ReturnType<typeof runDoctor>>
): Promise<void> {
  if (!response.ok) {
    if (
      command.kind === "doctor" ||
      command.json ||
      (command.kind === "review.export" && command.format === "json")
    )
      await writeCliText(process.stdout, formatCliResponse(command, response));
    await writeCliText(
      process.stderr,
      `${response.error.code}: ${response.error.message}\n`
    );
    process.exitCode = cliExitCode(
      new AgentProtocolError(response.error.code, response.error.message)
    );
    return;
  }
  await writeCliText(process.stdout, formatCliResponse(command, response));
}
void main()
  .catch(async (error: unknown) => {
    process.exitCode = cliExitCode(error);
    if (wantsJsonOutput(process.argv.slice(2)))
      await writeCliText(process.stdout, `${JSON.stringify(cliErrorResponse(error))}\n`);
    await writeCliText(
      process.stderr,
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    if (error instanceof CliUsageError) await writeCliText(process.stderr, help);
  })
  .catch(() => {
    process.exitCode = 5;
  });
