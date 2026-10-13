import { realpath } from "node:fs/promises";
import { getWorktreeInfo } from "@difftray/git";
import { createReviewTargetId } from "@difftray/core";
import {
  AgentProtocolError,
  type ExplicitAgentSelector
} from "../shared/agent-protocol.js";
import { loadExplicitReviewTarget } from "./review-context-service.js";

export function assertAgentOpenActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new AgentProtocolError("request_timeout", "Repository opening was cancelled.");
}

/** Resolves exact identity and refs without opening tabs or changing selected settings. */
export async function prepareAgentOpen(
  repoPath: string,
  selector: ExplicitAgentSelector,
  signal?: AbortSignal
) {
  assertAgentOpenActive(signal);
  let canonical: string;
  try {
    canonical = await realpath((await getWorktreeInfo(await realpath(repoPath))).root);
  } catch {
    throw new AgentProtocolError(
      "repository_missing",
      "Repository is missing or unavailable."
    );
  }
  assertAgentOpenActive(signal);
  let target;
  try {
    target = await loadExplicitReviewTarget(canonical, selector);
  } catch {
    throw new AgentProtocolError(
      "invalid_target",
      "Cannot resolve the requested target."
    );
  }
  assertAgentOpenActive(signal);
  return {
    repoPath: canonical,
    target,
    reviewTargetId: createReviewTargetId(target),
    selector:
      target.kind === "commit"
        ? { kind: "commit" as const, commit: target.commitSha }
        : selector
  };
}
