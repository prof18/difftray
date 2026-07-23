import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "./settings-panel.js";

describe("SettingsPanel", () => {
  it("renders app settings sections, active values, and actions", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({
          companionEnabled: true,
          companionPort: 48620,
          defaultDiffMode: "unified",
          editorArgList: ["-b", "com.microsoft.VSCode", "{path}"],
          editorArgs: "-b com.microsoft.VSCode {path}",
          editorCommand: "open",
          editorMode: "preset",
          notifyOnDrift: false,
          showGeneratedFiles: true,
          themeMode: "dark",
          wrapDiffLines: false
        })}
        companionPairing={null}
        companionState={companionState({
          addresses: [
            {
              address: "192.168.1.24:48620",
              host: "192.168.1.24",
              isTailscale: false
            }
          ],
          devices: [
            {
              createdAt: "2026-07-02T10:00:00.000Z",
              id: "device-1",
              lastSeenAt: "2026-07-02T11:00:00.000Z",
              name: "Marco iPhone",
              platform: "ios",
              publicKey: "device-public-key"
            }
          ],
          enabled: true,
          port: 48620,
          status: "running"
        })}
        disabled={false}
        editorOptions={[
          editorOption({
            args: ["-b", "com.microsoft.VSCode", "{path}"],
            command: "open",
            id: "vscode",
            name: "VS Code"
          })
        ]}
        onCancel={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onSave={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Settings options"');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Settings");
    expect(html).toContain("General");
    expect(html).toContain("Editor");
    expect(html).toContain("Review");
    expect(html).toContain("Phone companion");
    expect(html).toContain("port 48620");
    expect(html).toContain("Local network");
    expect(html).toContain("192.168.1.24:48620");
    expect(html).toContain("Marco iPhone");
    expect(html).toContain("Last seen");
    expect(html).toContain("Revoke");
    expect(html).toContain("Pair new device");
    expect(html).toContain('value="dark" selected=""');
    expect(html).toContain('aria-label="Editor: VS Code"');
    expect(html).toContain("Default diff view");
    expect(html).toContain("Unified");
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Wrap long lines");
    expect(html).toContain("Show generated files");
    expect(html).toContain("Notify when reviewed file drifts");
    expect(html).toContain("Cancel");
    expect(html).toContain("Save");
    expect(html).toContain('aria-label="Close settings"');
  });

  it("disables controls while settings are saving", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({})}
        companionPairing={null}
        companionState={companionState({})}
        disabled={true}
        editorOptions={[]}
        onCancel={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onSave={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Editor: System default"');
    expect(html).toContain('disabled=""');
  });

  it("collapses the companion section while disabled", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({ companionEnabled: false })}
        companionPairing={null}
        companionState={companionState({
          enabled: false,
          status: "stopped"
        })}
        disabled={false}
        editorOptions={[]}
        onCancel={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onSave={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).toContain("Phone companion");
    expect(html).toContain("Companion mode");
    expect(html).not.toContain("Pair new device");
    expect(html).not.toContain("Paired devices");
  });

  it("teaches first-time users how to install and pair the companion app", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({ companionEnabled: true })}
        companionPairing={null}
        companionState={companionState({
          addresses: [
            {
              address: "192.168.1.24:48620",
              host: "192.168.1.24",
              isTailscale: false
            },
            {
              address: "100.69.19.43:48620",
              host: "100.69.19.43",
              isTailscale: true
            }
          ],
          enabled: true,
          port: 48620,
          status: "running"
        })}
        disabled={false}
        editorOptions={[]}
        onCancel={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onSave={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).toContain("Review your changes from your phone");
    expect(html).toContain("No paired devices yet — install the app and pair below.");
    expect(html).toContain("Get the app");
    expect(html).toContain(">App Store<");
    expect(html).toContain(">Google Play<");
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(2);
    expect(html).not.toContain("download-on-the-app-store.svg");
    expect(html).not.toContain("get-it-on-google-play.png");
    expect(html).toContain("How to connect your phone");
    expect(html).toContain("same Wi-Fi network");
    expect(html).toContain("private networking service");
    expect(html).toContain("such as Tailscale");
    expect(html).toContain("Pair a computer");
    expect(html).not.toContain("<details");
  });

  it("keeps paired-device help compact in a closed accordion", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({ companionEnabled: true })}
        companionPairing={null}
        companionState={companionState({
          devices: [
            {
              createdAt: "2026-07-02T10:00:00.000Z",
              id: "device-1",
              name: "Marco iPhone",
              platform: "ios",
              publicKey: "device-public-key"
            }
          ],
          enabled: true,
          port: 48620,
          status: "running"
        })}
        disabled={false}
        editorOptions={[]}
        onCancel={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onSave={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).not.toContain("Review your changes from your phone");
    expect(html).toContain("iOS · Last seen never");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("How to connect a phone");
  });

  it("renders companion startup errors and pending pair requests", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({ companionEnabled: true })}
        companionPairing={null}
        companionState={companionState({
          enabled: true,
          errorMessage: "No companion port is available in 48620-48629.",
          pendingPairRequests: [
            {
              deviceId: "phone-1",
              deviceName: "Marco Pixel",
              devicePublicKey: "device-public-key",
              devicePublicKeyFingerprint: "ABCD-1234-EF56",
              expiresAt: "2026-07-02T12:05:00.000Z",
              id: "pair-request-1",
              platform: "android"
            }
          ],
          status: "error"
        })}
        disabled={false}
        editorOptions={[]}
        onCancel={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onSave={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).toContain("No companion port is available");
    expect(html).toContain("Marco Pixel wants to pair");
    expect(html).toContain("ABCD-1234-EF56");
    expect(html).toContain("Approve");
    expect(html).toContain("Deny");
  });

  it("renders the companion QR pairing dialog", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel
        appSettings={appSettings({ companionEnabled: true })}
        companionPairing={{
          code: "123456",
          expiresAt: "2099-07-02T12:05:00.000Z",
          qrPayload: {
            addresses: ["http://192.168.1.24:48620", "100.69.19.43:48620"],
            expiresAt: "2099-07-02T12:05:00.000Z",
            kind: "difftray-pairing",
            protocolVersion: 1,
            secret: "pairing-secret",
            serverId: "server-1",
            serverName: "Difftray",
            serverPublicKey: "server-public-key"
          }
        }}
        companionState={companionState({
          addresses: [
            {
              address: "192.168.1.24:48620",
              host: "192.168.1.24",
              isTailscale: false
            },
            {
              address: "100.69.19.43:48620",
              host: "100.69.19.43",
              isTailscale: true
            }
          ],
          enabled: true,
          port: 48620,
          status: "running"
        })}
        disabled={false}
        editorOptions={[]}
        onCancel={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onSave={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Pair new phone"');
    expect(html).toContain("123456");
    expect(html).toContain("Expires in");
    expect(html).toContain("Computer address");
    expect(html).toContain("192.168.1.24:48620");
    expect(html).toContain("100.69.19.43:48620");
    expect(html).toContain("Tailscale");
    expect(html).not.toContain("difftray.tailnet.ts.net");
    expect(html).toContain("Generate new code");
    expect(html).toContain("Pairing QR code");
  });
});

function appSettings(input: Partial<AppSettingsView>): AppSettingsView {
  return {
    autoCollapseHunksOver: 80,
    companionEnabled: false,
    companionPort: 48620,
    defaultDiffMode: "split",
    editorArgList: [],
    editorArgs: "",
    editorCommand: "",
    editorMode: "system",
    hideWhitespaceOnlyChanges: true,
    notifyOnDrift: true,
    reviewResetTrigger: "diff_content",
    showGeneratedFiles: false,
    themeMode: "system",
    wrapDiffLines: true,
    ...input
  };
}

function editorOption(input: Partial<EditorPresetView>): EditorPresetView {
  return {
    args: ["-a", "Editor", "{path}"],
    command: "open",
    id: "editor",
    name: "Editor",
    ...input
  };
}

function companionState(input: Partial<CompanionStateView>): CompanionStateView {
  return {
    activePairing: null,
    addresses: [],
    devices: [],
    enabled: false,
    pendingPairRequests: [],
    status: "stopped",
    ...input
  };
}
