import { useState, type ReactElement } from "react";

import type { DiffSurfaceHostMessage, DiffSurfaceMessage } from "./surface-bridge.js";
import { DiffSurfaceApp, type DiffSurfaceAppState } from "./surface-app.js";
import type { DiffSurfaceHarnessAction } from "./surface-harness-fixtures.js";
import { serializeSurfaceMessage } from "./surface-outbound.js";

type DiffSurfaceBrowserHarnessProps = {
  readonly actions: readonly DiffSurfaceHarnessAction[];
  readonly largeFixtureMessage: DiffSurfaceHostMessage;
  readonly onClearMessages: () => void;
  readonly onSendHostMessage: (message: DiffSurfaceHostMessage) => void;
  readonly outboundMessages: readonly DiffSurfaceMessage[];
  readonly initialState: DiffSurfaceAppState;
  readonly surface: ReactElement;
};

export function DiffSurfaceBrowserHarness({
  actions,
  largeFixtureMessage,
  onClearMessages,
  onSendHostMessage,
  outboundMessages,
  initialState,
  surface
}: DiffSurfaceBrowserHarnessProps): ReactElement {
  const [showSecondSurface, setShowSecondSurface] = useState(false);
  const [secondState, setSecondState] = useState(initialState);
  const [secondMessages, setSecondMessages] = useState<readonly DiffSurfaceMessage[]>([]);

  const recordSecondMessage = (message: DiffSurfaceMessage): void => {
    setSecondMessages((messages) => [...messages, message].slice(-30));
  };

  return (
    <main className="diff-harness">
      <aside className="diff-harness__panel">
        <div className="diff-harness__header">
          <strong>Bridge harness</strong>
          <span>Local browser controls for HostMessage round trips.</span>
        </div>

        <div className="diff-harness__actions">
          {actions.map((action) => (
            <button
              className="diff-harness__button"
              key={`${action.message.kind}:${action.label}`}
              onClick={() => onSendHostMessage(action.message)}
              type="button"
            >
              <strong>{action.label}</strong>
              <span>{action.detail}</span>
            </button>
          ))}

          <button
            className="diff-harness__button diff-harness__button--stress"
            onClick={() => onSendHostMessage(largeFixtureMessage)}
            type="button"
          >
            <strong>Load 5k patch</strong>
            <span>Manual smooth-scroll and render timing fixture.</span>
          </button>

          <button
            className="diff-harness__button"
            data-testid="show-second-surface"
            onClick={() => {
              setSecondState(initialState);
              setShowSecondSurface((visible) => !visible);
            }}
            type="button"
          >
            <strong>
              {showSecondSurface ? "Hide second surface" : "Show second surface"}
            </strong>
            <span>Toggle an independent keyed surface and message log.</span>
          </button>
        </div>

        <div className="diff-harness__log-header">
          <strong>Surface messages</strong>
          <button onClick={onClearMessages} type="button">
            Clear
          </button>
        </div>

        <ol className="diff-harness__log" data-testid="diff-harness-primary-log">
          {outboundMessages.length === 0 ? (
            <li>No messages yet.</li>
          ) : (
            outboundMessages.map((message, index) => (
              <li key={`${message.kind}-${String(index)}`}>
                <code>{serializeSurfaceMessage(message)}</code>
              </li>
            ))
          )}
        </ol>
      </aside>

      <section
        className="diff-harness__surface"
        data-testid="diff-harness-primary-surface"
        style={
          showSecondSurface
            ? {
                display: "grid",
                gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 16
              }
            : undefined
        }
      >
        {surface}
        {showSecondSurface ? (
          <section
            className="diff-harness__surface"
            data-testid="diff-harness-second-surface"
            key="second-diff-surface"
            style={{
              display: "grid",
              gridTemplateRows: "minmax(0, 1fr) auto",
              minHeight: 0
            }}
          >
            <DiffSurfaceApp onSurfaceMessage={recordSecondMessage} state={secondState} />
            <ol data-testid="diff-harness-second-log">
              {secondMessages.map((message, index) => (
                <li key={`${message.kind}-${String(index)}`}>
                  <code>{serializeSurfaceMessage(message)}</code>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </section>
    </main>
  );
}
