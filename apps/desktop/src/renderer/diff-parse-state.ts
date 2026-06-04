import { createDiffsRenderModel, type DiffsRenderModel } from "./diffs-renderer.js";

export type DiffParseState =
  | {
      readonly key: string;
      readonly status: "parsing";
    }
  | ReadyDiffParseState;

export type ReadyDiffParseState = {
  readonly key: string;
  readonly model: DiffsRenderModel;
  readonly parseMs: number;
  readonly status: "ready";
};

export type CreateReadyDiffParseStateInput = {
  readonly diffHash: string;
  readonly filePath: string;
  readonly newText: string | undefined;
  readonly oldText: string | undefined;
  readonly parseKey: string;
  readonly patch: string;
  readonly previousPath: string | undefined;
  readonly status: ReviewFileView["status"];
};

export function createReadyDiffParseState({
  diffHash,
  filePath,
  newText,
  oldText,
  parseKey,
  patch,
  previousPath,
  status
}: CreateReadyDiffParseStateInput): ReadyDiffParseState {
  const parseStartedAt = performance.now();
  const model = createDiffsRenderModel({
    diffHash,
    filePath,
    ...(newText !== undefined ? { newText } : {}),
    ...(oldText !== undefined ? { oldText } : {}),
    patch,
    ...(previousPath !== undefined ? { previousPath } : {}),
    status
  });

  return {
    key: parseKey,
    model,
    parseMs: Math.round(performance.now() - parseStartedAt),
    status: "ready"
  };
}
