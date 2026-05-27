export type UpdatePhase =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "downloading"; readonly percent: number; readonly version: string }
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "error"; readonly message: string };

export const initialUpdatePhase: UpdatePhase = { kind: "idle" };

export type UpdateEvent =
  | { readonly kind: "checking" }
  | { readonly kind: "available"; readonly version: string }
  | { readonly kind: "not-available" }
  | { readonly kind: "progress"; readonly percent: number }
  | { readonly kind: "downloaded"; readonly version: string }
  | { readonly kind: "error"; readonly message: string };

type UpdateListener = (phase: UpdatePhase) => void;

export class UpdateState {
  private currentPhase: UpdatePhase = initialUpdatePhase;
  private readonly listeners = new Set<UpdateListener>();

  get phase(): UpdatePhase {
    return this.currentPhase;
  }

  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  handleEvent(event: UpdateEvent): void {
    this.currentPhase = nextUpdatePhase(this.currentPhase, event);

    for (const listener of this.listeners) {
      listener(this.currentPhase);
    }
  }
}

export function nextUpdatePhase(
  previousPhase: UpdatePhase,
  event: UpdateEvent
): UpdatePhase {
  switch (event.kind) {
    case "checking":
      return { kind: "checking" };
    case "available":
      return { kind: "available", version: event.version };
    case "not-available":
      return { kind: "idle" };
    case "progress":
      return {
        kind: "downloading",
        percent: event.percent,
        version:
          previousPhase.kind === "available" || previousPhase.kind === "downloading"
            ? previousPhase.version
            : ""
      };
    case "downloaded":
      return { kind: "downloaded", version: event.version };
    case "error":
      return { kind: "error", message: event.message };
  }
}
