import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentOpenCoordinator } from "./agent-open-ack.js";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function setup() {
  let sender = 7;
  const coordinator = createAgentOpenCoordinator({
    getRendererSenderId: () => sender,
    timeoutMs: 100
  });
  const send = vi.fn();
  const prepare = vi.fn(async () => ({
    projectId: "project",
    reviewTargetId: "target",
    send
  }));
  const ack = (
    requestId = "one",
    status: "selected" | "load_failed" | "busy" = "selected"
  ) =>
    coordinator.acknowledge(sender, {
      requestId,
      projectId: "project",
      reviewTargetId: "target",
      status
    });
  return {
    coordinator,
    send,
    prepare,
    ack,
    replace: () => {
      sender = 8;
    }
  };
}
afterEach(() => vi.useRealTimers());
describe("agent open acknowledgement", () => {
  it("waits for trusted listener readiness and an exact acknowledgement", async () => {
    const s = setup();
    const result = s.coordinator.open({ requestId: "one", prepare: s.prepare });
    await flush();
    expect(s.send).not.toHaveBeenCalled();
    expect(s.coordinator.rendererReady(9)).toBe(false);
    s.coordinator.rendererReady(7);
    await flush();
    expect(s.send).toHaveBeenCalledOnce();
    for (const changes of [
      { requestId: "wrong" },
      { projectId: "wrong" },
      { reviewTargetId: "wrong" }
    ]) {
      expect(
        s.coordinator.acknowledge(7, {
          requestId: "one",
          projectId: "project",
          reviewTargetId: "target",
          status: "selected",
          ...changes
        })
      ).toBe(false);
    }
    expect(
      s.coordinator.acknowledge(9, {
        requestId: "one",
        projectId: "project",
        reviewTargetId: "target",
        status: "selected"
      })
    ).toBe(false);
    expect(s.ack()).toBe(true);
    await result;
    expect(s.ack()).toBe(false);
  });
  it("serializes selections and never prepares an expired queued request", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const s = setup();
    s.coordinator.rendererReady(7);
    let finish!: (value: {
      projectId: string;
      reviewTargetId: string;
      send: () => void;
    }) => void;
    const first = s.coordinator.open({
      requestId: "one",
      prepare: () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    });
    const secondPrepare = vi.fn(s.prepare);
    const second = s.coordinator.open({ requestId: "two", prepare: secondPrepare });
    const failures = Promise.all([
      expect(first).rejects.toMatchObject({ code: "request_timeout" }),
      expect(second).rejects.toMatchObject({ code: "request_timeout" })
    ]);
    await flush();
    expect(s.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await failures;
    finish({ projectId: "project", reviewTargetId: "target", send: s.send });
    await flush();
    expect(secondPrepare).not.toHaveBeenCalled();
    expect(s.ack()).toBe(false);
  });
  it("expires while waiting for listeners and ignores late readiness", async () => {
    vi.useFakeTimers();
    const s = setup();
    const result = s.coordinator.open({ requestId: "one", prepare: s.prepare });
    const failure = expect(result).rejects.toMatchObject({ code: "request_timeout" });
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    s.coordinator.rendererReady(7);
    await flush();
    expect(s.send).not.toHaveBeenCalled();
  });
  it("never prepares a request that was already aborted", async () => {
    const s = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      s.coordinator.open({
        requestId: "one",
        signal: controller.signal,
        prepare: s.prepare
      })
    ).rejects.toMatchObject({ code: "request_timeout" });
    expect(s.prepare).not.toHaveBeenCalled();
  });
  it("starts the next request only after acknowledgement", async () => {
    const s = setup();
    s.coordinator.rendererReady(7);
    const first = s.coordinator.open({ requestId: "one", prepare: s.prepare });
    const second = s.coordinator.open({ requestId: "two", prepare: s.prepare });
    await flush();
    expect(s.prepare).toHaveBeenCalledOnce();
    s.ack();
    await first;
    await flush();
    expect(s.send).toHaveBeenCalledTimes(2);
    s.ack("two");
    await second;
  });
  it.each(["load_failed", "busy"] as const)(
    "reports %s without false success",
    async (status) => {
      const s = setup();
      s.coordinator.rendererReady(7);
      const result = s.coordinator.open({ requestId: "one", prepare: s.prepare });
      await flush();
      s.ack("one", status);
      await expect(result).rejects.toMatchObject({
        code: status === "busy" ? "busy" : "app_unavailable"
      });
    }
  );
  it("cancels on destruction and requires readiness from a replacement renderer", async () => {
    const s = setup();
    s.coordinator.rendererReady(7);
    const result = s.coordinator.open({ requestId: "one", prepare: s.prepare });
    await flush();
    s.coordinator.rendererDestroyed(9);
    s.coordinator.rendererDestroyed(7);
    await expect(result).rejects.toMatchObject({ code: "app_unavailable" });
    s.replace();
    const next = s.coordinator.open({ requestId: "two", prepare: s.prepare });
    await flush();
    expect(s.send).toHaveBeenCalledOnce();
    s.coordinator.rendererReady(8);
    await flush();
    s.ack("two");
    await next;
  });
  it("aborts asynchronous preparation before it can send", async () => {
    const s = setup();
    s.coordinator.rendererReady(7);
    const controller = new AbortController();
    let finish!: (value: {
      projectId: string;
      reviewTargetId: string;
      send: () => void;
    }) => void;
    const result = s.coordinator.open({
      requestId: "one",
      signal: controller.signal,
      prepare: () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    });
    await flush();
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "request_timeout" });
    finish({ projectId: "project", reviewTargetId: "target", send: s.send });
    await flush();
    expect(s.send).not.toHaveBeenCalled();
  });
});
