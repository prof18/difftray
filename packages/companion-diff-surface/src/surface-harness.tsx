import type { ReactElement } from "react";

import type { DiffSurfaceHostMessage, DiffSurfaceMessage } from "./surface-bridge.js";
import type { DiffSurfaceHarnessAction } from "./surface-harness-fixtures.js";
import { serializeSurfaceMessage } from "./surface-outbound.js";

type DiffSurfaceBrowserHarnessProps = {
  readonly actions: readonly DiffSurfaceHarnessAction[];
  readonly largeFixtureMessage: DiffSurfaceHostMessage;
  readonly onClearMessages: () => void;
  readonly onSendHostMessage: (message: DiffSurfaceHostMessage) => void;
  readonly outboundMessages: readonly DiffSurfaceMessage[];
  readonly surface: ReactElement;
};

export function DiffSurfaceBrowserHarness({
  actions,
  largeFixtureMessage,
  onClearMessages,
  onSendHostMessage,
  outboundMessages,
  surface
}: DiffSurfaceBrowserHarnessProps): ReactElement {
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
              key={action.message.kind}
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
        </div>

        <div className="diff-harness__log-header">
          <strong>Surface messages</strong>
          <button onClick={onClearMessages} type="button">
            Clear
          </button>
        </div>

        <ol className="diff-harness__log">
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

      <section className="diff-harness__surface">{surface}</section>
    </main>
  );
}
