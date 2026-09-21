export type DroppedRepositoryPreviewRequestCallbacks<Candidate> = {
  readonly clearPreview: () => void;
  readonly isCurrent: () => boolean;
  readonly onCandidates: (candidates: readonly Candidate[]) => void;
  readonly onEmpty: () => void;
  readonly onError: (error: unknown) => void;
  readonly previewDroppedRepositories: (
    files: readonly File[]
  ) => Promise<readonly Candidate[]>;
};

export function requestDroppedRepositoryPreview<Candidate>(
  files: readonly File[],
  callbacks: DroppedRepositoryPreviewRequestCallbacks<Candidate>
): void {
  // The main process invalidates its candidate IDs when the next preview starts.
  // Remove the prior dialog before this request can make those IDs stale.
  callbacks.clearPreview();
  if (files.length === 0) return;

  void callbacks
    .previewDroppedRepositories(files)
    .then((candidates) => {
      if (!callbacks.isCurrent()) return;
      if (candidates.length === 0) {
        callbacks.onEmpty();
      } else {
        callbacks.onCandidates(candidates);
      }
    })
    .catch((error: unknown) => {
      if (callbacks.isCurrent()) callbacks.onError(error);
    });
}
