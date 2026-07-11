import { describe, expectTypeOf, it } from "vitest";

import type {
  FileDiffStatus,
  ProjectReviewSummaryView,
  ReviewCommentSide,
  ReviewFileDiffContentView,
  ReviewFileView,
  ReviewProgressView,
  ReviewWorkspaceView
} from "../src/index.js";

describe("view model types", () => {
  it("exports the desktop review view shapes without core dependencies", () => {
    expectTypeOf<FileDiffStatus>().toEqualTypeOf<
      "added" | "deleted" | "modified" | "mode_changed" | "renamed"
    >();
    expectTypeOf<ReviewCommentSide>().toEqualTypeOf<"additions" | "deletions">();

    expectTypeOf<ProjectReviewSummaryView>().toMatchTypeOf<{
      readonly attentionCount: number;
      readonly progress: ReviewProgressView;
    }>();
    expectTypeOf<ReviewFileView>().toMatchTypeOf<{
      readonly diffHash: string;
      readonly path: string;
      readonly status: FileDiffStatus;
    }>();
    expectTypeOf<ReviewFileDiffContentView>().toMatchTypeOf<{
      readonly patch: string;
      readonly status: FileDiffStatus;
    }>();
    expectTypeOf<ReviewWorkspaceView["reviewTarget"]>().toMatchTypeOf<{
      readonly headSha: string;
      readonly kind: "branch" | "commit" | "working_tree";
    }>();
  });
});
