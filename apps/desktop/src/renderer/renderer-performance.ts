type RendererPerformanceLogger = Pick<Console, "info">;
type RendererPerformanceStorage = Pick<Storage, "getItem">;

export function rendererPerformanceLoggingEnabled(
  storage: RendererPerformanceStorage = window.localStorage
): boolean {
  try {
    return storage.getItem("difftray:perf") === "1";
  } catch {
    return false;
  }
}

export function logRendererPerformance(
  event: string,
  payload: Readonly<Record<string, unknown>>,
  options: {
    readonly enabled?: boolean;
    readonly logger?: RendererPerformanceLogger;
  } = {}
): void {
  if (!(options.enabled ?? rendererPerformanceLoggingEnabled())) {
    return;
  }

  (options.logger ?? console).info(
    "[difftray:perf]",
    JSON.stringify({
      event,
      ...payload
    })
  );
}

export function elapsedSince(startedAt: number, now = performance.now()): number {
  return Math.round(now - startedAt);
}
