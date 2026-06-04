import { describe, expect, it } from "vitest";

import {
  projectFromRow,
  projectSettingsFromRow,
  reviewCommentFromRow,
  reviewMarkFromRow,
  reviewTargetFromRow
} from "../src/rows.js";

describe("storage row mappers", () => {
  it("maps project rows and omits nullable fields when absent", () => {
    expect(
      projectFromRow({
        created_at: "2026-01-01T00:00:00.000Z",
        default_base_ref: null,
        id: "project-1",
        last_opened_at: null,
        name: "Difftray",
        path: "/tmp/difftray",
        updated_at: "2026-01-02T00:00:00.000Z"
      })
    ).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "project-1",
      name: "Difftray",
      path: "/tmp/difftray",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
  });

  it("maps project rows with optional default base ref and last opened time", () => {
    expect(
      projectFromRow({
        created_at: "2026-01-01T00:00:00.000Z",
        default_base_ref: "origin/main",
        id: "project-1",
        last_opened_at: "2026-01-03T00:00:00.000Z",
        name: "Difftray",
        path: "/tmp/difftray",
        updated_at: "2026-01-02T00:00:00.000Z"
      })
    ).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      defaultBaseRef: "origin/main",
      id: "project-1",
      lastOpenedAt: "2026-01-03T00:00:00.000Z",
      name: "Difftray",
      path: "/tmp/difftray",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
  });

  it("maps review target rows and omits absent refs", () => {
    expect(
      reviewTargetFromRow({
        base_ref_name: null,
        base_ref_sha: null,
        created_at: "2026-01-01T00:00:00.000Z",
        head_kind: "working_tree",
        head_ref_name: "main",
        head_ref_sha: "1111111111111111111111111111111111111111",
        id: "target-1",
        last_used_at: "2026-01-02T00:00:00.000Z",
        merge_base_sha: null,
        mode: "working_tree",
        project_id: "project-1"
      })
    ).toEqual({
      createdAt: "2026-01-01T00:00:00.000Z",
      headKind: "working_tree",
      headRefName: "main",
      headRefSha: "1111111111111111111111111111111111111111",
      id: "target-1",
      lastUsedAt: "2026-01-02T00:00:00.000Z",
      mode: "working_tree",
      projectId: "project-1"
    });
  });

  it("maps and clamps project settings rows", () => {
    expect(
      projectSettingsFromRow({
        auto_collapse_hunks_over: 120,
        default_diff_mode: "split",
        editor_launch_config_json: null,
        file_list_collapsed: 1,
        file_list_width: 900,
        hide_whitespace_only_changes: 0,
        notify_on_drift: 1,
        project_id: "project-1",
        review_reset_trigger: "diff_content",
        show_generated_files: 0
      })
    ).toEqual({
      fileListCollapsed: true,
      fileListWidth: 540,
      projectId: "project-1"
    });
  });

  it("maps review marks and review comments", () => {
    expect(
      reviewMarkFromRow({
        path: "src/app.ts",
        previous_path: "src/old-app.ts",
        reviewed_diff_hash: "hash-a",
        review_target_id: "target-1"
      })
    ).toEqual({
      path: "src/app.ts",
      previousPath: "src/old-app.ts",
      reviewedDiffHash: "hash-a",
      reviewTargetId: "target-1"
    });

    expect(
      reviewCommentFromRow({
        body: "Looks stale.",
        created_at: "2026-01-01T00:00:00.000Z",
        diff_hash: "hash-a",
        id: "comment-1",
        line_end: 12,
        line_start: 10,
        path: "src/app.ts",
        previous_path: null,
        project_id: "project-1",
        review_target_id: "target-1",
        side: "additions",
        updated_at: "2026-01-02T00:00:00.000Z"
      })
    ).toEqual({
      body: "Looks stale.",
      createdAt: "2026-01-01T00:00:00.000Z",
      diffHash: "hash-a",
      id: "comment-1",
      lineEnd: 12,
      lineStart: 10,
      path: "src/app.ts",
      projectId: "project-1",
      reviewTargetId: "target-1",
      side: "additions",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
  });
});
