import { ATTRIBUTION_CAPABILITY } from "./version.js";

const attributionKeys = new Set(["createdBy", "lastEditedBy", "noteVersion"]);

/** Preserve legacy response shapes for clients that cannot parse attribution fields. */
export function projectFeedbackAttribution(
  value: unknown,
  capabilities: readonly string[]
): unknown {
  if (capabilities.includes(ATTRIBUTION_CAPABILITY)) return value;
  return legacyFeedback(value);
}

function legacyFeedback(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legacyFeedback);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !attributionKeys.has(key))
      .map(([key, entry]) => [key, legacyFeedback(entry)])
  );
}
