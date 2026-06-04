import { describe, expect, it } from "vitest";

import {
  fileListVisibleWindow,
  nextFileListScrollTopForSelection
} from "./file-list-virtualization.js";

describe("fileListVisibleWindow", () => {
  it("clamps the start index to the first row at the top of the list", () => {
    expect(
      fileListVisibleWindow({
        fileCount: 100,
        overscanRows: 8,
        rowHeight: 54,
        scrollTop: 0,
        viewportHeight: 216
      })
    ).toEqual({
      endIndex: 20,
      startIndex: 0,
      visibleRowCount: 4
    });
  });

  it("includes overscan rows around the visible viewport in the middle of the list", () => {
    expect(
      fileListVisibleWindow({
        fileCount: 100,
        overscanRows: 8,
        rowHeight: 54,
        scrollTop: 540,
        viewportHeight: 216
      })
    ).toEqual({
      endIndex: 22,
      startIndex: 2,
      visibleRowCount: 4
    });
  });

  it("clamps the end index to the file count", () => {
    expect(
      fileListVisibleWindow({
        fileCount: 12,
        overscanRows: 8,
        rowHeight: 54,
        scrollTop: 540,
        viewportHeight: 216
      })
    ).toEqual({
      endIndex: 12,
      startIndex: 2,
      visibleRowCount: 4
    });
  });
});

describe("nextFileListScrollTopForSelection", () => {
  it("scrolls up when the selected row is above the viewport", () => {
    expect(
      nextFileListScrollTopForSelection({
        clientHeight: 216,
        currentScrollTop: 540,
        rowHeight: 54,
        selectedIndex: 4
      })
    ).toBe(216);
  });

  it("scrolls down when the selected row is below the viewport", () => {
    expect(
      nextFileListScrollTopForSelection({
        clientHeight: 216,
        currentScrollTop: 0,
        rowHeight: 54,
        selectedIndex: 6
      })
    ).toBe(162);
  });

  it("keeps the current scroll position when the selected row is visible", () => {
    expect(
      nextFileListScrollTopForSelection({
        clientHeight: 216,
        currentScrollTop: 108,
        rowHeight: 54,
        selectedIndex: 3
      })
    ).toBe(108);
  });

  it("keeps the current scroll position when no row is selected", () => {
    expect(
      nextFileListScrollTopForSelection({
        clientHeight: 216,
        currentScrollTop: 108,
        rowHeight: 54,
        selectedIndex: -1
      })
    ).toBe(108);
  });
});
