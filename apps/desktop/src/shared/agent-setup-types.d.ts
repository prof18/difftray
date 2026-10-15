export type AgentSkillTarget = "claude" | "codex" | "pi" | "other";

export type AgentSkillStatus = {
  readonly target: AgentSkillTarget;
  readonly label: string;
  readonly destination: string | null;
  readonly kind: "absent" | "installed" | "repairable" | "blocked" | "unavailable";
  readonly reason: string | null;
};

export type AgentSetupInfo =
  | { readonly available: false }
  | { readonly available: true; readonly skills: readonly AgentSkillStatus[] };

export type AgentCheckResult =
  | { readonly status: "connected" }
  | { readonly status: "failed"; readonly message: string };
