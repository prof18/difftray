export type AgentOpenSelectionRequest = {
  readonly requestId: string;
  readonly projectId: string;
  readonly reviewTargetId: string;
};
export type AgentOpenSelectionAck = AgentOpenSelectionRequest & {
  readonly status: "selected" | "load_failed" | "busy";
};
export function createAgentOpenSelection(
  acknowledge: (ack: AgentOpenSelectionAck) => void
) {
  let pending: { request: AgentOpenSelectionRequest; loadId: number } | undefined;
  function finish(status: AgentOpenSelectionAck["status"]) {
    if (!pending) return;
    const { request } = pending;
    pending = undefined;
    acknowledge({ ...request, status });
  }
  return {
    cancel(requestId: string) {
      if (pending?.request.requestId !== requestId) return false;
      pending = undefined;
      return true;
    },
    begin(request: AgentOpenSelectionRequest, loadId: number) {
      finish("busy");
      pending = { request, loadId };
    },
    navigation(loadId: number) {
      if (pending && pending.loadId !== loadId) finish("busy");
    },
    failed(requestId: string) {
      if (pending?.request.requestId === requestId) finish("load_failed");
    },
    committed(projectId: string, targetId: string, loadId: number) {
      if (!pending) return;
      if (loadId !== pending.loadId) {
        finish("busy");
        return;
      }
      if (projectId !== pending.request.projectId) return;
      finish(targetId === pending.request.reviewTargetId ? "selected" : "busy");
    }
  };
}

/** An agent open needs no reload when this exact review is already on screen. */
export function isAgentOpenAlreadyShown(
  shown: { readonly projectId: string; readonly reviewTargetId: string } | undefined,
  request: AgentOpenSelectionRequest
): boolean {
  return (
    shown?.projectId === request.projectId &&
    shown.reviewTargetId === request.reviewTargetId
  );
}
