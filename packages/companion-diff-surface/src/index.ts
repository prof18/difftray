export {
  DIFF_SURFACE_BRIDGE_VERSION,
  parseHostMessage,
  type DiffSurfaceMessage,
  type DiffSurfaceDraftRange,
  type DiffSurfaceHostMessage,
  type DiffSurfaceLineSnippet,
  type DiffSurfaceMode,
  type DiffSurfaceSide,
  type DiffSurfaceThemeTokens,
  type DiffSurfaceWrapLines,
  type ThemeTokens
} from "./surface-bridge.js";
export {
  createDiffSurfaceHostMessageReceiver,
  type DiffSurfaceChunkFrame,
  type DiffSurfaceHostMessageReceiveResult
} from "./surface-host-message-receiver.js";
export { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";
