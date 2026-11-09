/** Why the main process closed a project tab. */
export type ProjectClosedReason = "closed" | "vanished";

export type ProjectClosedEvent = {
  readonly projectId: string;
  readonly reason: ProjectClosedReason;
};
