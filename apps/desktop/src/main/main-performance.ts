import { performance } from "node:perf_hooks";

type MainPerformanceLogger = Pick<Console, "info">;
type MainPerformanceEnv = Readonly<Record<string, string | undefined>>;

export function mainPerformanceLoggingEnabled(
  env: MainPerformanceEnv = process.env
): boolean {
  return env.DIFFTRAY_PERF_LOG === "1";
}

export function logMainPerformance(
  event: string,
  payload: Readonly<Record<string, unknown>>,
  options: {
    readonly enabled?: boolean;
    readonly logger?: MainPerformanceLogger;
  } = {}
): void {
  if (!(options.enabled ?? mainPerformanceLoggingEnabled())) {
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
