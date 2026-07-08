import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";
import {
  DIFF_SURFACE_BRIDGE_VERSION,
  type DiffSurfaceHostMessage,
  type DiffSurfaceMessage
} from "./surface-bridge.js";
import { DiffSurfaceBrowserHarness } from "./surface-harness.js";
import {
  createDiffSurfaceHarnessActions,
  createLargeFixtureShowFileMessage
} from "./surface-harness-fixtures.js";
import { createDiffSurfaceHostMessageReceiver } from "./surface-host-message-receiver.js";
import { createRenderedMessage, serializeSurfaceMessage } from "./surface-outbound.js";
import { waitForDiffSurfacePaint } from "./surface-render-signal.js";
import { diffSurfaceThemeTokens } from "./surface-theme.js";
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
  showFileHeader: true,
  status: "modified",
  theme: diffSurfaceThemeTokens("light"),
  wrapLines: true
};

const root = createRoot(rootElement);
const hostMessageReceiver = createDiffSurfaceHostMessageReceiver();
const harnessActions = createDiffSurfaceHarnessActions();
const largeFixtureMessage = createLargeFixtureShowFileMessage();
const isBrowserHarness = window.ReactNativeWebView === undefined;
let hasRendered = false;
let renderGeneration = 0;
let outboundMessages: readonly DiffSurfaceMessage[] = [];

function render(): void {
  const surface = <DiffSurfaceApp onSurfaceMessage={postMessage} state={state} />;

  flushSync(() => {
    root.render(
      isBrowserHarness ? (
        <DiffSurfaceBrowserHarness
          actions={harnessActions}
          largeFixtureMessage={largeFixtureMessage}
          onClearMessages={clearHarnessMessages}
          onSendHostMessage={sendHarnessMessage}
          outboundMessages={outboundMessages}
          surface={surface}
        />
      ) : (
        surface
      )
    );
  });
  hasRendered = true;
}

window.__difftrayReceive = (rawMessage) => {
  const startMs = performance.now();
  const received = hostMessageReceiver.receive(rawMessage);

  if (received.kind === "pending") {
    return;
  }

  if (received.kind === "invalid") {
    postMessage({ kind: "error", message: received.message });
    return;
  }

  const { message } = received;

  let renderedResult: { readonly generation: number; readonly path: string } | null =
    null;

  switch (message.kind) {
    case "init":
      state = {
        ...state,
        diffMode: message.diffMode,
        showFileHeader: message.showFileHeader,
        theme: message.theme,
        wrapLines: message.wrapLines
      };
      break;
    case "show_file": {
      const stateWithoutScrollTarget = { ...state };
      delete stateWithoutScrollTarget.scrollTo;
      delete stateWithoutScrollTarget.newText;
      delete stateWithoutScrollTarget.oldText;

      state = {
        ...stateWithoutScrollTarget,
        comments: message.comments,
        diffHash: message.diffHash,
        draft: null,
        ...(message.newText === undefined ? {} : { newText: message.newText }),
        ...(message.oldText === undefined ? {} : { oldText: message.oldText }),
        patch: message.patch,
        path: message.path,
        status: message.status,
        ...(message.scrollTo === undefined ? {} : { scrollTo: message.scrollTo })
      };
      renderGeneration += 1;
      renderedResult = { generation: renderGeneration, path: message.path };
      break;
    }
    case "set_comments":
      state = { ...state, comments: message.comments };
      break;
    case "set_diff_mode":
      state = { ...state, diffMode: message.diffMode };
      break;
    case "set_wrap_lines":
      state = { ...state, wrapLines: message.wrapLines };
      break;
    case "set_draft":
      state = { ...state, draft: message.draft };
      break;
  }

  render();

  if (renderedResult) {
    void postRenderedAfterPaint({
      generation: renderedResult.generation,
      path: renderedResult.path,
      startMs
    });
  }
};

async function postRenderedAfterPaint({
  generation,
  path,
  startMs
}: {
  readonly generation: number;
  readonly path: string;
  readonly startMs: number;
}): Promise<void> {
  await waitForDiffSurfacePaint(window);

  if (generation !== renderGeneration) {
    return;
  }

  postMessage(
    createRenderedMessage({
      endMs: performance.now(),
      path,
      startMs
    })
  );
}

function postMessage(message: DiffSurfaceMessage): void {
  const serializedMessage = serializeSurfaceMessage(message);

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(serializedMessage);
    return;
  }

  outboundMessages = [...outboundMessages, message].slice(-30);

  if (hasRendered) {
    render();
  }
}

function sendHarnessMessage(message: DiffSurfaceHostMessage): void {
  window.__difftrayReceive?.(message);
}

function clearHarnessMessages(): void {
  outboundMessages = [];
  render();
}

render();
postMessage({ bridgeVersion: DIFF_SURFACE_BRIDGE_VERSION, kind: "ready" });
