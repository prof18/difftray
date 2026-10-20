import { Circle, CircleAlert, CircleCheck } from "lucide-react";

import styles from "./file-state.module.css";
import { type ReviewState } from "./review-view-model.js";

type ChangeStatus = ReviewFileView["status"];

/** One letter per change type, shared with the mobile file list. */
export function changeTypeLetter(status: ChangeStatus): "A" | "D" | "M" | "R" {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "modified":
    case "mode_changed":
      return "M";
  }
}

export function ChangeTypeTile({
  status
}: {
  readonly status: ChangeStatus;
}): React.JSX.Element {
  return (
    <span aria-hidden="true" className={styles.changeTypeTile} data-change-type={status}>
      {changeTypeLetter(status)}
    </span>
  );
}

export function ReviewStateGlyph({
  size = 14,
  state
}: {
  readonly size?: number;
  readonly state: ReviewState;
}): React.JSX.Element {
  const Icon =
    state === "attention" ? CircleAlert : state === "reviewed" ? CircleCheck : Circle;

  return (
    <span aria-hidden="true" className={styles.reviewGlyph} data-review-state={state}>
      <Icon size={size} strokeWidth={state === "pending" ? 1.4 : 1.8} />
    </span>
  );
}
