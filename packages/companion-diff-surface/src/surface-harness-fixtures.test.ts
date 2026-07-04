import { describe, expect, it } from "vitest";

import { parseHostMessage, type DiffSurfaceHostMessage } from "./surface-bridge.js";
import {
  createDiffSurfaceHarnessActions,
  createLargeFixturePatch,
  harnessXssFixtureText
} from "./surface-harness-fixtures.js";

describe("diff surface browser harness fixtures", () => {
  it("covers every host message kind with strict parser-compatible actions", () => {
    const actions = createDiffSurfaceHarnessActions();
    const expectedKinds = [
      "init",
      "init",
      "set_comments",
      "set_diff_mode",
      "set_draft",
      "show_file",
      "show_file"
    ] satisfies readonly DiffSurfaceHostMessage["kind"][];

    expect(actions.map((action) => action.message.kind).sort()).toEqual(expectedKinds);

    for (const action of actions) {
      expect(parseHostMessage(action.message)).toEqual(action.message);
    }
  });

  it("keeps xss fixture payload inert and available to the patch renderer", () => {
    const actions = createDiffSurfaceHarnessActions();
    const showFile = actions.find((action) => action.message.kind === "show_file");

    if (!showFile || showFile.message.kind !== "show_file") {
      throw new Error("Missing show_file harness action");
    }

    expect(showFile.message.patch).toContain(harnessXssFixtureText);
    expect(showFile.message.newText).toContain(harnessXssFixtureText);
  });

  it("includes a large-fixture scroll target for browser proof", () => {
    const actions = createDiffSurfaceHarnessActions();
    const showAtLine = actions.find(
      (action) => action.label === "Load 5k patch at line 4800"
    );

    expect(showAtLine?.message).toMatchObject({
      kind: "show_file",
      scrollTo: { line: 4_800, side: "additions" }
    });
  });

  it("creates a 5000-line fixture patch for manual browser performance checks", () => {
    const patch = createLargeFixturePatch({ changedLines: 5_000 });

    expect(patch).toContain("diff --git a/src/large-fixture.ts b/src/large-fixture.ts");
    expect(
      patch.split("\n").filter((line) => line.startsWith("+export const value"))
    ).toHaveLength(5_000);
  });
});
