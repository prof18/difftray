export type ProjectRecord = {
  readonly defaultBaseRef?: string;
  readonly defaultCommitRef?: string;
  readonly defaultDiffTargetMode?: "branch" | "commit" | "working_tree";
  readonly id: string;
  readonly lastOpenedAt?: string;
  readonly name: string;
  readonly path: string;
};

export type StoredProjectRecord = ProjectRecord & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ReviewTargetRecord = {
  readonly baseRefName?: string;
  readonly baseRefSha?: string;
  readonly commitSha?: string;
  readonly commitShortSha?: string;
  readonly commitSubject?: string;
  readonly headKind: "ref" | "working_tree";
  readonly headRefName?: string;
  readonly headRefSha?: string;
  readonly id: string;
  readonly mergeBaseSha?: string;
  readonly mode: "branch" | "commit" | "working_tree";
  readonly parentSha?: string;
  readonly projectId: string;
};

export type StoredReviewTargetRecord = ReviewTargetRecord & {
  readonly createdAt: string;
  readonly lastUsedAt: string;
};

export type ReviewMarkInput = {
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type ReviewMarkRecord = {
  readonly path: string;
  readonly previousPath?: string;
  readonly reviewedDiffHash: string;
  readonly reviewTargetId: string;
};

export type ReviewCommentSide = "additions" | "deletions";

export type CreateReviewCommentInput = {
  readonly body: string;
  readonly diffHash: string;
  readonly lineEnd: number;
  readonly lineStart: number;
  readonly path: string;
  readonly previousPath?: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
  readonly side: ReviewCommentSide;
};

export type ReviewCommentRecord = CreateReviewCommentInput & {
  readonly createdAt: string;
  readonly id: string;
  readonly updatedAt: string;
};
