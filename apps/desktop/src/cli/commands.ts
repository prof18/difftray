import path from "node:path";
import {
  CLI_PROTOCOL_VERSION,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  parseAgentRequest,
  type AgentSelector
} from "../shared/agent-protocol.js";

export class CliUsageError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

type PageOptions = { readonly limit: number; readonly cursor?: string };
type RepoOptions = { readonly repoPath: string; readonly selector: AgentSelector };

export type CliCommand =
  | { readonly kind: "help" }
  | { readonly kind: "version"; readonly json: boolean }
  | { readonly kind: "schema" }
  | { readonly kind: "doctor"; readonly appPath?: string; readonly json: boolean }
  | {
      readonly kind: "open";
      readonly repoPath: string;
      readonly selector: AgentSelector;
      readonly json: boolean;
    }
  | ({ readonly kind: "review.inspect" } & RepoOptions & { readonly json: boolean })
  | ({ readonly kind: "review.files"; readonly contextId: string } & PageOptions & {
        readonly json: boolean;
      })
  | {
      readonly kind: "review.file";
      readonly contextId: string;
      readonly path: string;
      readonly json: boolean;
    }
  | ({ readonly kind: "review.feedback"; readonly contextId: string } & PageOptions & {
        readonly includeInactive: boolean;
        readonly json: boolean;
      })
  | ({ readonly kind: "review.export" } & (
      { readonly contextId: string } | RepoOptions
    ) & { readonly format: "prompt" | "json"; readonly json: boolean })
  | {
      readonly kind: "feedback.submit";
      readonly contextId: string;
      readonly input: string;
      readonly requestId?: string;
      readonly json: boolean;
    }
  | {
      readonly kind: "worktree.label.set";
      readonly repoPath: string;
      /** `null` resets the label. */
      readonly label: string | null;
      readonly json: boolean;
    };

type OptionKind = "string" | "boolean";
type ParsedOptions = {
  readonly positionals: string[];
  readonly values: Map<string, string | boolean>;
};

function parseOptions(
  args: readonly string[],
  allowed: Readonly<Record<string, OptionKind>>
): ParsedOptions {
  const positionals: string[] = [];
  const values = new Map<string, string | boolean>();
  let optionsEnded = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) continue;
    if (optionsEnded) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      optionsEnded = true;
      continue;
    }
    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }

    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    const kind = allowed[name];
    if (!kind) throw new CliUsageError(`Unknown option: ${name}`);
    if (values.has(name))
      throw new CliUsageError(`Option ${name} may only be supplied once.`);

    if (kind === "boolean") {
      if (equals !== -1) throw new CliUsageError(`Option ${name} does not take a value.`);
      values.set(name, true);
      continue;
    }

    let value: string;
    if (equals !== -1) {
      value = token.slice(equals + 1);
    } else {
      const next = args[index + 1];
      if (next === undefined || (next.startsWith("-") && next !== "-")) {
        throw new CliUsageError(`Option ${name} requires a value.`);
      }
      value = next;
      index += 1;
    }
    if (value.length === 0)
      throw new CliUsageError(`Option ${name} requires a non-empty value.`);
    values.set(name, value);
  }
  return { positionals, values };
}

function stringValue(
  values: Map<string, string | boolean>,
  name: string
): string | undefined {
  const value = values.get(name);
  return typeof value === "string" ? value : undefined;
}

function boolValue(values: Map<string, string | boolean>, name: string): boolean {
  return values.get(name) === true;
}

function assertNoPositionals(positionals: readonly string[]): void {
  const unexpected = positionals[0];
  if (unexpected !== undefined)
    throw new CliUsageError(`Unexpected argument: ${unexpected}`);
}

function selectorFrom(
  values: Map<string, string | boolean>,
  defaultTarget: "working-tree" | "selected"
): AgentSelector {
  const target = stringValue(values, "--target") ?? defaultTarget;
  const base = stringValue(values, "--base");
  const commit = stringValue(values, "--commit");

  if (target === "working-tree") {
    if (base || commit)
      throw new CliUsageError(
        "--base and --commit only apply to branch or commit targets."
      );
    return { kind: "working-tree" };
  }
  if (target === "selected") {
    if (base || commit)
      throw new CliUsageError("--base and --commit require an explicit target.");
    return { kind: "selected" };
  }
  if (target === "branch") {
    if (!base)
      throw new CliUsageError("--base is required when --target branch is used.");
    if (commit) throw new CliUsageError("--commit cannot be used with --target branch.");
    return { kind: "branch", base };
  }
  if (target === "commit") {
    if (!commit)
      throw new CliUsageError("--commit is required when --target commit is used.");
    if (base) throw new CliUsageError("--base cannot be used with --target commit.");
    return { kind: "commit", commit };
  }
  throw new CliUsageError(`Unknown target: ${target}`);
}

const commonJson = { "--json": "boolean" } as const;
const selectorOptions = {
  "--target": "string",
  "--base": "string",
  "--commit": "string"
} as const;

function parseOpen(args: readonly string[], cwd: string): CliCommand {
  const { positionals, values } = parseOptions(args, {
    ...commonJson,
    ...selectorOptions
  });
  const extraArgument = positionals[1];
  if (extraArgument !== undefined)
    throw new CliUsageError(`Unexpected argument: ${extraArgument}`);
  // Without a target, an already open worktree keeps the diff the user chose.
  const selector = selectorFrom(values, "selected");
  return {
    kind: "open",
    repoPath: path.resolve(cwd, positionals[0] ?? cwd),
    selector,
    json: boolValue(values, "--json")
  };
}

function parseReviewInspect(args: readonly string[], cwd: string): CliCommand {
  const { positionals, values } = parseOptions(args, {
    ...commonJson,
    ...selectorOptions,
    "--repo": "string"
  });
  assertNoPositionals(positionals);
  return {
    kind: "review.inspect",
    repoPath: path.resolve(cwd, stringValue(values, "--repo") ?? cwd),
    selector: selectorFrom(values, "selected"),
    json: boolValue(values, "--json")
  };
}

function pageOptions(values: Map<string, string | boolean>): PageOptions {
  const rawLimit = stringValue(values, "--limit");
  const limit = rawLimit === undefined ? PAGE_SIZE_DEFAULT : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX) {
    throw new CliUsageError(
      `--limit must be an integer from 1 to ${String(PAGE_SIZE_MAX)}.`
    );
  }
  const cursor = stringValue(values, "--cursor");
  return cursor === undefined ? { limit } : { limit, cursor };
}

function parseReview(args: readonly string[], cwd: string): CliCommand {
  const [operation, ...rest] = args;
  if (!operation)
    throw new CliUsageError(
      "Missing review operation (inspect, files, file, feedback, export)."
    );
  if (operation === "inspect") return parseReviewInspect(rest, cwd);

  if (operation === "files" || operation === "feedback") {
    const { positionals, values } = parseOptions(rest, {
      ...commonJson,
      "--context": "string",
      "--limit": "string",
      "--cursor": "string",
      ...(operation === "feedback" ? { "--include-inactive": "boolean" as const } : {})
    });
    assertNoPositionals(positionals);
    const contextId = stringValue(values, "--context");
    if (!contextId) throw new CliUsageError("--context is required.");
    const page = pageOptions(values);
    if (operation === "files") {
      return {
        kind: "review.files",
        contextId,
        ...page,
        json: boolValue(values, "--json")
      };
    }
    return {
      kind: "review.feedback",
      contextId,
      ...page,
      includeInactive: boolValue(values, "--include-inactive"),
      json: boolValue(values, "--json")
    };
  }

  if (operation === "file") {
    const { positionals, values } = parseOptions(rest, {
      ...commonJson,
      "--context": "string",
      "--path": "string"
    });
    assertNoPositionals(positionals);
    const contextId = stringValue(values, "--context");
    const filePath = stringValue(values, "--path");
    if (!contextId) throw new CliUsageError("--context is required.");
    if (!filePath) throw new CliUsageError("--path is required.");
    return {
      kind: "review.file",
      contextId,
      path: filePath,
      json: boolValue(values, "--json")
    };
  }

  if (operation === "export") {
    const { positionals, values } = parseOptions(rest, {
      ...commonJson,
      ...selectorOptions,
      "--repo": "string",
      "--context": "string",
      "--format": "string"
    });
    assertNoPositionals(positionals);
    const contextId = stringValue(values, "--context");
    const repoPath = stringValue(values, "--repo");
    const format = stringValue(values, "--format") ?? "prompt";
    if (format !== "prompt" && format !== "json")
      throw new CliUsageError("--format must be prompt or json.");
    if (contextId) {
      if (
        repoPath ||
        values.has("--target") ||
        values.has("--base") ||
        values.has("--commit")
      ) {
        throw new CliUsageError(
          "--context cannot be combined with repository selector options."
        );
      }
      return {
        kind: "review.export",
        contextId,
        format,
        json: boolValue(values, "--json")
      };
    }
    return {
      kind: "review.export",
      repoPath: path.resolve(cwd, repoPath ?? cwd),
      selector: selectorFrom(values, "selected"),
      format,
      json: boolValue(values, "--json")
    };
  }

  throw new CliUsageError(`Unknown review operation: ${operation}`);
}

function parseWorktree(args: readonly string[], cwd: string): CliCommand {
  const [group, operation, ...rest] = args;
  if (group !== "label" || (operation !== "set" && operation !== "reset"))
    throw new CliUsageError(
      `Unknown worktree operation: ${[group, operation].filter(Boolean).join(" ") || "(empty)"}`
    );
  const { positionals, values } = parseOptions(rest, {
    ...commonJson,
    "--repo": "string",
    ...(operation === "set" ? { "--label": "string" } : {})
  });
  assertNoPositionals(positionals);
  const repo = stringValue(values, "--repo");
  if (!repo) throw new CliUsageError("--repo is required.");
  const label = operation === "set" ? stringValue(values, "--label") : null;
  if (label === undefined) throw new CliUsageError("--label is required.");
  return {
    kind: "worktree.label.set",
    repoPath: path.resolve(cwd, repo),
    label,
    json: boolValue(values, "--json")
  };
}

function parseCliArgumentsRaw(argv: readonly string[], cwd: string): CliCommand {
  if (argv.length === 0) return { kind: "help" };
  if (argv.includes("--help") || argv.includes("-h")) {
    if (argv.some((arg) => arg !== "--help" && arg !== "-h")) {
      throw new CliUsageError("Help cannot be combined with command arguments.");
    }
    return { kind: "help" };
  }
  if (argv[0] === "--version") {
    const { positionals, values } = parseOptions(argv.slice(1), commonJson);
    assertNoPositionals(positionals);
    return { kind: "version", json: boolValue(values, "--json") };
  }
  if (argv[0] === "schema") {
    assertNoPositionals(argv.slice(1));
    if (argv.length > 1) throw new CliUsageError("schema takes no arguments.");
    return { kind: "schema" };
  }
  if (argv[0] === "doctor") {
    const { positionals, values } = parseOptions(argv.slice(1), {
      ...commonJson,
      "--app": "string"
    });
    assertNoPositionals(positionals);
    const appPath = stringValue(values, "--app");
    return appPath === undefined
      ? { kind: "doctor", json: boolValue(values, "--json") }
      : { kind: "doctor", appPath, json: boolValue(values, "--json") };
  }
  if (argv[0] === "open") return parseOpen(argv.slice(1), cwd);
  if (argv[0] === "review") return parseReview(argv.slice(1), cwd);
  if (argv[0] === "worktree") return parseWorktree(argv.slice(1), cwd);
  if (argv[0] === "feedback" && argv[1] === "submit") {
    const { positionals, values } = parseOptions(argv.slice(2), {
      ...commonJson,
      "--context": "string",
      "--input": "string",
      "--request-id": "string"
    });
    assertNoPositionals(positionals);
    const contextId = stringValue(values, "--context");
    const input = stringValue(values, "--input");
    if (!contextId) throw new CliUsageError("--context is required.");
    if (!input) throw new CliUsageError("--input is required (use - for stdin).");
    const requestId = stringValue(values, "--request-id");
    return requestId === undefined
      ? { kind: "feedback.submit", contextId, input, json: boolValue(values, "--json") }
      : {
          kind: "feedback.submit",
          contextId,
          input,
          requestId,
          json: boolValue(values, "--json")
        };
  }
  throw new CliUsageError(`Unknown command: ${argv[0] ?? "(empty)"}`);
}

function validateCommand(command: CliCommand): CliCommand {
  if (
    command.kind === "help" ||
    command.kind === "version" ||
    command.kind === "schema" ||
    command.kind === "doctor"
  ) {
    return command;
  }

  let method: string;
  let params: Record<string, unknown>;
  switch (command.kind) {
    case "open":
      method = "open";
      params = { repoPath: command.repoPath, selector: command.selector };
      break;
    case "review.inspect":
      method = "review.inspect";
      params = { repoPath: command.repoPath, selector: command.selector };
      break;
    case "review.files":
      method = "review.files";
      params = {
        contextId: command.contextId,
        limit: command.limit,
        cursor: command.cursor
      };
      break;
    case "review.file":
      method = "review.file";
      params = { contextId: command.contextId, path: command.path };
      break;
    case "review.feedback":
      method = "review.feedback";
      params = {
        contextId: command.contextId,
        limit: command.limit,
        cursor: command.cursor,
        includeInactive: command.includeInactive
      };
      break;
    case "review.export":
      if ("contextId" in command) {
        method = "review.export";
        params = { contextId: command.contextId, format: command.format };
      } else {
        method = "review.inspect";
        params = { repoPath: command.repoPath, selector: command.selector };
      }
      break;
    case "feedback.submit":
      // Validate its context through a read-only operation; submission payload validation
      // happens after the input file/stdin has been loaded.
      method = "review.files";
      params = { contextId: command.contextId };
      break;
    case "worktree.label.set":
      method = "worktree.label.set";
      params = { repoPath: command.repoPath, label: command.label };
      break;
  }

  try {
    parseAgentRequest(
      `${JSON.stringify({
        version: CLI_PROTOCOL_VERSION,
        id: "cli-parse-check",
        token: "a".repeat(64),
        method,
        params
      })}\n`
    );
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
  return command;
}

export function parseCliArguments(
  argv: readonly string[],
  cwd = process.cwd()
): CliCommand {
  return validateCommand(parseCliArgumentsRaw(argv, cwd));
}
