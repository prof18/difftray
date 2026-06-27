import type { UpdatePhase } from "./update-state.js";

export type UpdateMenuItemState = {
  readonly enabled: boolean;
  readonly label: string;
};

export function resolveUpdateMenuItemState(phase: UpdatePhase): UpdateMenuItemState {
  switch (phase.kind) {
    case "checking":
    case "available":
    case "downloading":
      return {
        enabled: false,
        label: "Checking for Updates…"
      };
    case "downloaded":
      return {
        enabled: false,
        label: "Update Ready to Install"
      };
    case "error":
    case "idle":
      return {
        enabled: true,
        label: "Check for Updates…"
      };
  }
}
