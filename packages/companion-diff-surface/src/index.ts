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
  DIFF_SURFACE_DEFAULT_CHUNK_DATA_LENGTH,
  createDiffSurfaceHostMessageFrames,
  createDiffSurfaceHostMessageReceiver,
  type DiffSurfaceChunkFrame,
  type DiffSurfaceHostMessageFrame,
  type DiffSurfaceHostMessageFrameOptions,
  type DiffSurfaceHostMessageReceiveResult
} from "./surface-host-message-receiver.js";
export {
  createCommentTappedMessage,
  createLineSelectedMessage,
  createRenderedMessage,
  serializeSurfaceMessage
} from "./surface-outbound.js";
export { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";
