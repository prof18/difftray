export function canRunApplicationCommand(
  loadState: "idle" | "loading",
  settingsOpen = false
): boolean {
  return loadState !== "loading" && !settingsOpen;
}

export function runApplicationCommandIfAllowed(
  loadState: "idle" | "loading",
  command: () => void,
  settingsOpen = false
): void {
  if (canRunApplicationCommand(loadState, settingsOpen)) {
    command();
  }
}
