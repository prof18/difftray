import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { openStorage } from "../src/index.js";
import {
  applyProjectTabOrder,
  parseStoredProjectTabOrder,
  sanitizeProjectTabOrder
} from "../src/project-tab-order.js";

describe("applyProjectTabOrder", () => {
  it("keeps storage order when no tab order is stored", () => {
    const projects = [project("newest"), project("older")];

    expect(applyProjectTabOrder(projects, [])).toEqual(projects);
  });

  it("reorders projects to match the stored tab order", () => {
    expect(
      applyProjectTabOrder(
        [project("newest"), project("middle"), project("oldest")],
        ["oldest", "newest", "middle"]
      )
    ).toEqual([project("oldest"), project("newest"), project("middle")]);
  });

  it("appends projects missing from the stored tab order", () => {
    expect(
      applyProjectTabOrder(
        [project("newest"), project("older")],
        ["older"]
      )
    ).toEqual([project("older"), project("newest")]);
  });

  it("drops stored ids that no longer exist", () => {
    expect(
      applyProjectTabOrder([project("reader-flow")], ["missing", "reader-flow"])
    ).toEqual([project("reader-flow")]);
  });

  it("ignores duplicate stored ids", () => {
    expect(
      applyProjectTabOrder(
        [project("reader-flow"), project("difftray")],
        ["difftray", "difftray", "reader-flow"]
      )
    ).toEqual([project("difftray"), project("reader-flow")]);
  });
});

describe("sanitizeProjectTabOrder", () => {
  it("keeps only known project ids in the requested order", () => {
    expect(
      sanitizeProjectTabOrder(
        [project("reader-flow"), project("difftray")],
        ["difftray", "missing", "reader-flow", "difftray"]
      )
    ).toEqual(["difftray", "reader-flow"]);
  });
});

describe("parseStoredProjectTabOrder", () => {
  it("parses a stored json array of project ids", () => {
    expect(parseStoredProjectTabOrder(JSON.stringify(["b", "a"]))).toEqual(["b", "a"]);
  });

  it("returns an empty order for missing or invalid stored values", () => {
    expect(parseStoredProjectTabOrder(undefined)).toEqual([]);
    expect(parseStoredProjectTabOrder("")).toEqual([]);
    expect(parseStoredProjectTabOrder("{")).toEqual([]);
    expect(parseStoredProjectTabOrder(JSON.stringify(["a", 1]))).toEqual(["a"]);
  });
});

describe("stored project tab order", () => {
  it("persists and reloads the tab order", () => {
    const storageDir = mkdtempSync(path.join(tmpdir(), "difftray-tab-order-"));
    const storagePath = path.join(storageDir, "difftray.sqlite");

    const storage = openStorage(storagePath);

    try {
      expect(storage.getProjectTabOrder()).toEqual([]);

      storage.upsertProjectTabOrder(["project-b", "project-a"]);
      expect(storage.getProjectTabOrder()).toEqual(["project-b", "project-a"]);
    } finally {
      storage.close();
    }

    const reopenedStorage = openStorage(storagePath);

    try {
      expect(reopenedStorage.getProjectTabOrder()).toEqual(["project-b", "project-a"]);
    } finally {
      reopenedStorage.close();
    }
  });

  it("appends new projects without disturbing the existing order", () => {
    const storage = openStorage(":memory:");

    try {
      storage.upsertProjectTabOrder(["project-a", "project-b"]);
      storage.appendProjectToTabOrder("project-c");

      expect(storage.getProjectTabOrder()).toEqual(["project-a", "project-b", "project-c"]);
      storage.appendProjectToTabOrder("project-b");

      expect(storage.getProjectTabOrder()).toEqual(["project-a", "project-b", "project-c"]);
    } finally {
      storage.close();
    }
  });

  it("removes closed projects from the stored tab order", () => {
    const storage = openStorage(":memory:");

    try {
      storage.upsertProjectTabOrder(["project-a", "project-b", "project-c"]);
      storage.removeProjectFromTabOrder("project-b");

      expect(storage.getProjectTabOrder()).toEqual(["project-a", "project-c"]);
    } finally {
      storage.close();
    }
  });

  it("deduplicates ids when persisting tab order", () => {
    const storage = openStorage(":memory:");

    try {
      storage.upsertProjectTabOrder(["project-a", "project-b", "project-a"]);

      expect(storage.getProjectTabOrder()).toEqual(["project-a", "project-b"]);
    } finally {
      storage.close();
    }
  });
});

function project(id: string) {
  return { id };
}
