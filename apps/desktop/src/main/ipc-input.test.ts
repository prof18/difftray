import { describe, expect, it } from "vitest";

import {
  readBooleanProperty,
  readEnumProperty,
  readNumberProperty,
  readOptionalBooleanProperty,
  readOptionalStringArrayProperty,
  readOptionalStringProperty,
  readStringProperty,
  readUnknownProperty
} from "./ipc-input.js";

describe("IPC input property readers", () => {
  it("reads required scalar properties", () => {
    const input = {
      count: 4,
      enabled: false,
      projectId: "project-1"
    };

    expect(readStringProperty(input, "projectId")).toBe("project-1");
    expect(readBooleanProperty(input, "enabled")).toBe(false);
    expect(readNumberProperty(input, "count")).toBe(4);
  });

  it("throws stable validation errors for missing or invalid required values", () => {
    expect(() => readStringProperty({}, "projectId")).toThrow(
      "Invalid IPC payload: missing projectId"
    );
    expect(() => readBooleanProperty({ enabled: "yes" }, "enabled")).toThrow(
      "Invalid IPC payload: missing enabled"
    );
    expect(() =>
      readNumberProperty({ count: Number.POSITIVE_INFINITY }, "count")
    ).toThrow("Invalid IPC payload: missing count");
  });

  it("reads optional values and treats null as absent", () => {
    expect(
      readOptionalStringProperty({ baseRefName: null }, "baseRefName")
    ).toBeUndefined();
    expect(readOptionalStringProperty({ baseRefName: "main" }, "baseRefName")).toBe(
      "main"
    );
    expect(
      readOptionalBooleanProperty({ reportProgress: null }, "reportProgress")
    ).toBeUndefined();
    expect(readOptionalBooleanProperty({ reportProgress: true }, "reportProgress")).toBe(
      true
    );
  });

  it("validates optional value types when present", () => {
    expect(() => readOptionalStringProperty({ baseRefName: 42 }, "baseRefName")).toThrow(
      "Invalid IPC payload: baseRefName must be a string"
    );
    expect(() =>
      readOptionalBooleanProperty({ reportProgress: "true" }, "reportProgress")
    ).toThrow("Invalid IPC payload: reportProgress must be a boolean");
  });

  it("reads optional string arrays without accepting mixed arrays", () => {
    expect(readOptionalStringArrayProperty({}, "editorArgList")).toBeUndefined();
    expect(
      readOptionalStringArrayProperty({ editorArgList: ["--goto"] }, "editorArgList")
    ).toEqual(["--goto"]);
    expect(() =>
      readOptionalStringArrayProperty({ editorArgList: ["--goto", 12] }, "editorArgList")
    ).toThrow("Invalid IPC payload: editorArgList must be a string array");
  });

  it("reads enum properties from supported string values", () => {
    expect(readEnumProperty({ mode: "branch" }, "mode", ["branch", "working_tree"])).toBe(
      "branch"
    );
    expect(() =>
      readEnumProperty({ mode: "commit_range" }, "mode", ["branch", "working_tree"])
    ).toThrow("Invalid IPC payload: unsupported mode");
  });

  it("reads unknown own properties only", () => {
    const inherited = Object.create({ projectId: "inherited" }) as unknown;

    expect(readUnknownProperty({ projectId: "own" }, "projectId")).toBe("own");
    expect(readUnknownProperty(inherited, "projectId")).toBeUndefined();
    expect(readUnknownProperty(null, "projectId")).toBeUndefined();
  });
});
