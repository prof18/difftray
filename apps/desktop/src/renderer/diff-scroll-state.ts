export type DiffScrollKeyInput = {
  readonly diffHash: string;
  readonly filePath: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
};

export type DiffScrollPosition = {
  readonly left: number;
  readonly top: number;
};

export const topDiffScrollPosition: DiffScrollPosition = {
  left: 0,
  top: 0
};

export function createDiffScrollKey(input: DiffScrollKeyInput): string {
  return [input.projectId, input.reviewTargetId, input.filePath, input.diffHash].join(
    "\0"
  );
}

export function normalizeDiffScrollPosition(
  position: DiffScrollPosition
): DiffScrollPosition {
  return {
    left: finiteScrollOffset(position.left),
    top: finiteScrollOffset(position.top)
  };
}

function finiteScrollOffset(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
