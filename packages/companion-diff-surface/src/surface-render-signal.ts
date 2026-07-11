export type DiffSurfacePaintScheduler = Pick<Window, "requestAnimationFrame">;

export function waitForDiffSurfacePaint({
  requestAnimationFrame
}: DiffSurfacePaintScheduler): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}
