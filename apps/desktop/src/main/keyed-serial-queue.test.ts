import { describe, expect, it } from "vitest";

import { KeyedSerialQueue } from "./keyed-serial-queue.js";

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("KeyedSerialQueue", () => {
  it("runs tasks for the same key one after another, in call order", async () => {
    const queue = new KeyedSerialQueue();
    const events: string[] = [];
    const slowGate = deferred();

    const slow = queue.run("project-a", async () => {
      events.push("unmark start");
      await slowGate.promise;
      events.push("unmark write");
    });
    const fast = queue.run("project-a", async () => {
      events.push("mark start");
      events.push("mark write");
    });

    await Promise.resolve();
    expect(events).toEqual(["unmark start"]);
    slowGate.resolve();
    await Promise.all([slow, fast]);

    expect(events).toEqual(["unmark start", "unmark write", "mark start", "mark write"]);
  });

  it("does not hold up tasks for other keys", async () => {
    const queue = new KeyedSerialQueue();
    const gate = deferred();
    const events: string[] = [];

    const blocked = queue.run("project-a", async () => {
      await gate.promise;
      events.push("a");
    });
    await queue.run("project-b", async () => {
      events.push("b");
    });

    expect(events).toEqual(["b"]);
    gate.resolve();
    await blocked;
    expect(events).toEqual(["b", "a"]);
  });

  it("keeps going after a task fails and passes results through", async () => {
    const queue = new KeyedSerialQueue();

    const failed = queue.run("project-a", async () => {
      throw new Error("boom");
    });
    const next = queue.run("project-a", async () => 42);

    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe(42);
  });

  it("forgets a key once its queue is empty", async () => {
    const queue = new KeyedSerialQueue();

    await queue.run("project-a", async () => undefined);
    await queue
      .run("project-b", async () => {
        throw new Error("boom");
      })
      .catch(() => undefined);

    expect(queue.size).toBe(0);
  });
});
