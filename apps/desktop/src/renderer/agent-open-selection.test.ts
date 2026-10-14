import { describe, expect, it, vi } from "vitest";
import {
  createAgentOpenSelection,
  isAgentOpenAlreadyShown
} from "./agent-open-selection.js";
const request = { requestId: "one", projectId: "/repo", reviewTargetId: "target" };
describe("agent renderer selection", () => {
  it("treats an open as already shown only for the same project and target", () => {
    const shown = { projectId: "/repo", reviewTargetId: "target" };
    expect(isAgentOpenAlreadyShown(shown, request)).toBe(true);
    expect(isAgentOpenAlreadyShown({ ...shown, reviewTargetId: "other" }, request)).toBe(
      false
    );
    expect(isAgentOpenAlreadyShown({ ...shown, projectId: "/other" }, request)).toBe(
      false
    );
    expect(isAgentOpenAlreadyShown(undefined, request)).toBe(false);
  });
  it("clears a cancelled request without acknowledgement or later completion", () => {
    const acknowledge = vi.fn();
    const selection = createAgentOpenSelection(acknowledge);
    selection.begin(request, 3);
    expect(selection.cancel("one")).toBe(true);
    expect(selection.cancel("one")).toBe(false);
    selection.committed("/repo", "target", 3);
    selection.failed("one");
    selection.navigation(4);
    expect(acknowledge).not.toHaveBeenCalled();
  });
  it("ignores cancellation for an older request while the current request commits", () => {
    const acknowledge = vi.fn();
    const selection = createAgentOpenSelection(acknowledge);
    selection.begin(request, 3);
    selection.cancel("one");
    const current = { ...request, requestId: "two" };
    selection.begin(current, 4);
    expect(selection.cancel("one")).toBe(false);
    selection.committed("/repo", "target", 4);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith({
      ...current,
      status: "selected"
    });
  });
  it("acknowledges only after the exact workspace is committed", () => {
    const acknowledge = vi.fn();
    const selection = createAgentOpenSelection(acknowledge);
    selection.begin(request, 3);
    selection.committed("/other", "target", 3);
    expect(acknowledge).not.toHaveBeenCalled();
    selection.committed("/repo", "target", 3);
    selection.committed("/repo", "target", 3);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith({
      ...request,
      status: "selected"
    });
  });
  it("rejects superseding navigation and load failures without false success", () => {
    const acknowledge = vi.fn();
    const selection = createAgentOpenSelection(acknowledge);
    selection.begin(request, 3);
    selection.navigation(4);
    expect(acknowledge).toHaveBeenLastCalledWith({ ...request, status: "busy" });
    selection.begin(request, 5);
    selection.failed("one");
    expect(acknowledge).toHaveBeenLastCalledWith({ ...request, status: "load_failed" });
  });
  it("rejects a mismatching target and ignores old failures", () => {
    const acknowledge = vi.fn();
    const selection = createAgentOpenSelection(acknowledge);
    selection.begin(request, 3);
    selection.failed("old");
    selection.committed("/repo", "wrong-target", 3);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith({ ...request, status: "busy" });
  });
});
