/**
 * Narrows the file list to paths containing every space-separated term,
 * ignoring case. Returns the input list itself when the query is blank so
 * callers can skip work when nothing is filtered.
 */
export function filterFilesByQuery<T extends { readonly path: string }>(
  files: readonly T[],
  query: string
): readonly T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return files;
  }

  return files.filter((file) => {
    const path = file.path.toLowerCase();
    return terms.every((term) => path.includes(term));
  });
}

/**
 * Identifies what a filter applies to. A filter typed for one project or
 * review target is dropped when either changes, but survives refreshes and
 * new commits on the same target.
 */
export function fileFilterScope(
  projectId: string,
  reviewTarget: {
    readonly baseRefName?: string;
    readonly commitSha?: string;
    readonly kind: string;
  }
): string {
  return [
    projectId,
    reviewTarget.kind,
    reviewTarget.baseRefName ?? "",
    reviewTarget.commitSha ?? ""
  ].join("\u0000");
}

export type FileFilterState = {
  readonly query: string;
  readonly scope: string;
};

/**
 * Returns the filter to keep once the scope may have changed. A query typed
 * for another scope is cleared, so switching away and back does not bring
 * it back.
 */
export function fileFilterForScope(
  filter: FileFilterState,
  scope: string
): FileFilterState {
  if (filter.scope === scope || filter.query.length === 0) {
    return filter;
  }

  return { query: "", scope };
}
