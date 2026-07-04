import { createRoot } from "react-dom/client";

import { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";
import { DIFF_SURFACE_BRIDGE_VERSION, parseHostMessage } from "./surface-bridge.js";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

let state: DiffSurfaceAppState = {
  comments: [],
  diffHash: "fixture",
  diffMode: "unified",
  draft: null,
  patch: "diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-Hello\n+Hello mobile",
  path: "README.md",
  theme: {
    accent: "#a34d2d",
    addedBackground: "rgba(56, 142, 60, 0.16)",
    addedForeground: "#2f7d32",
    background: "#fbfaf7",
    commentMarker: "#a34d2d",
    draftHighlight: "rgba(163, 77, 45, 0.18)",
    fontSizePx: 13,
    foreground: "#151515",
    foregroundMuted: "#68645f",
    removedBackground: "rgba(198, 40, 40, 0.14)",
    removedForeground: "#b3261e",
    scheme: "light"
  },
  wrapLines: true
};

const root = createRoot(rootElement);

function render(): void {
  root.render(<DiffSurfaceApp state={state} />);
}

window.__difftrayReceive = (rawMessage) => {
  const message = parseHostMessage(rawMessage);

  if (!message) {
    postMessage({ kind: "error", message: "Invalid host message" });
    return;
  }

  switch (message.kind) {
    case "init":
      state = {
        ...state,
        diffMode: message.diffMode,
        theme: message.theme,
        wrapLines: message.wrapLines
      };
      break;
    case "show_file":
      state = {
        ...state,
        comments: message.comments,
        diffHash: message.diffHash,
        draft: null,
        ...(message.newText === undefined ? {} : { newText: message.newText }),
        ...(message.oldText === undefined ? {} : { oldText: message.oldText }),
        patch: message.patch,
        path: message.path
      };
      break;
    case "set_comments":
      state = { ...state, comments: message.comments };
      break;
    case "set_diff_mode":
      state = { ...state, diffMode: message.diffMode };
      break;
    case "set_draft":
      state = { ...state, draft: message.draft };
      break;
  }

  render();
};

function postMessage(message: unknown): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

render();
postMessage({ bridgeVersion: DIFF_SURFACE_BRIDGE_VERSION, kind: "ready" });
