import { AgentProtocolError, REQUEST_TIMEOUT_MS } from "../shared/agent-protocol.js";

export type AgentOpenAcknowledgement = {
  readonly requestId: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
  readonly status: "selected" | "load_failed" | "busy";
};
export type PreparedAgentOpen = {
  readonly projectId: string;
  readonly reviewTargetId: string;
  /** Emit the correlated selection event synchronously; preparation must not select. */
  readonly send: () => void;
};
export type AgentOpenOperation = {
  readonly requestId: string;
  readonly signal?: AbortSignal;
  /** May create the window. Honor cancellation before any asynchronous side effect. */
  readonly prepare: (signal: AbortSignal) => Promise<PreparedAgentOpen>;
};
type Pending = {
  operation: AgentOpenOperation;
  controller: AbortController;
  deadline: number;
  settled: boolean;
  prepared?: PreparedAgentOpen;
  senderId?: number;
  sent: boolean;
  settle: (error?: unknown) => void;
};

export function createAgentOpenCoordinator(options: {
  getRendererSenderId: () => number | undefined;
  timeoutMs?: number;
}) {
  const queue: Pending[] = [];
  let active: Pending | undefined;
  let readySenderId: number | undefined;
  let running = false;
  const timeout = () =>
    new AgentProtocolError(
      "request_timeout",
      "Repository opening timed out or was cancelled"
    );
  const unavailable = () =>
    new AgentProtocolError("app_unavailable", "The repository renderer is unavailable");
  function alive(pending: Pending): boolean {
    if (
      !pending.settled &&
      (pending.controller.signal.aborted || Date.now() >= pending.deadline)
    )
      pending.settle(timeout());
    return !pending.settled;
  }
  function sendIfReady(pending: Pending) {
    if (!alive(pending) || !pending.prepared || pending.sent) return;
    const senderId = options.getRendererSenderId();
    if (senderId === undefined || readySenderId !== senderId) return;
    pending.senderId = senderId;
    pending.sent = true;
    try {
      pending.prepared.send();
    } catch (error) {
      pending.settle(error);
    }
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const pending = queue.shift();
        if (!pending) continue;
        if (!alive(pending)) continue;
        active = pending;
        // Keep the serialization lock until preparation finishes, even if cancelled.
        // This prevents abandoned preparation from racing the next operation.
        try {
          pending.prepared = await pending.operation.prepare(pending.controller.signal);
          if (alive(pending)) sendIfReady(pending);
        } catch (error) {
          pending.settle(error);
        }
        if (!pending.settled)
          await new Promise<void>((resolve) => {
            const onAbort = () => {
              pending.controller.signal.removeEventListener("abort", onAbort);
              resolve();
            };
            pending.controller.signal.addEventListener("abort", onAbort, { once: true });
            if (pending.settled) onAbort();
          });
        active = undefined;
      }
    } finally {
      running = false;
    }
  }
  return {
    open(operation: AgentOpenOperation): Promise<void> {
      if (
        queue.some((p) => !p.settled && p.operation.requestId === operation.requestId) ||
        (active && !active.settled && active.operation.requestId === operation.requestId)
      ) {
        return Promise.reject(
          new AgentProtocolError("busy", "Repository opening request is already pending")
        );
      }
      return new Promise<void>((resolve, reject) => {
        const controller = new AbortController();
        const duration = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
        const onAbort = () => pending.settle(timeout());
        const timer = setTimeout(onAbort, duration);
        const pending: Pending = {
          operation,
          controller,
          deadline: Date.now() + duration,
          settled: false,
          sent: false,
          settle(error) {
            if (pending.settled) return;
            pending.settled = true;
            clearTimeout(timer);
            operation.signal?.removeEventListener("abort", onAbort);
            controller.abort();
            if (error === undefined) resolve();
            else
              reject(
                error instanceof Error
                  ? error
                  : new AgentProtocolError("internal_error", "Repository opening failed.")
              );
          }
        };
        operation.signal?.addEventListener("abort", onAbort, { once: true });
        queue.push(pending);
        if (operation.signal?.aborted) onAbort();
        void drain();
      });
    },
    rendererReady(senderId: number): boolean {
      if (senderId !== options.getRendererSenderId()) return false;
      readySenderId = senderId;
      if (active) sendIfReady(active);
      return true;
    },
    acknowledge(senderId: number, acknowledgement: AgentOpenAcknowledgement): boolean {
      const pending = active;
      if (
        !pending ||
        !alive(pending) ||
        !pending.sent ||
        senderId !== options.getRendererSenderId() ||
        senderId !== pending.senderId ||
        acknowledgement.requestId !== pending.operation.requestId ||
        acknowledgement.projectId !== pending.prepared?.projectId ||
        acknowledgement.reviewTargetId !== pending.prepared.reviewTargetId
      )
        return false;
      if (acknowledgement.status === "selected") pending.settle();
      else if (acknowledgement.status === "busy")
        pending.settle(
          new AgentProtocolError("busy", "User navigation superseded repository opening")
        );
      else pending.settle(unavailable());
      return true;
    },
    rendererDestroyed(senderId: number): void {
      if (
        senderId !== readySenderId &&
        senderId !== options.getRendererSenderId() &&
        senderId !== active?.senderId
      )
        return;
      readySenderId = undefined;
      active?.settle(unavailable());
      for (const pending of queue) pending.settle(unavailable());
    }
  };
}
