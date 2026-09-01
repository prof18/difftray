/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "./settings-panel.js";

describe("SettingsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderSettingsPage(
    page: "general" | "review" | "repositories" | "companion",
    input: Partial<Parameters<typeof SettingsPanel>[0]> = {}
  ): HTMLElement {
    act(() => {
      root.render(<SettingsPanel {...settingsPanelProps(input)} />);
    });

    if (page !== "general") {
      const navigationButton = [
        ...container.querySelectorAll<HTMLButtonElement>(
          'nav[aria-label="Settings sections"] button'
        )
      ].find((button) => button.textContent.trim() === settingsPageLabel(page));

      act(() => {
        navigationButton?.click();
      });
    }

    const detail = container.querySelector<HTMLElement>(
      '[role="region"][aria-labelledby="settings-page-title"]'
    );

    expect(detail?.querySelector("#settings-page-title")?.textContent).toBe(
      settingsPageLabel(page)
    );

    if (!detail) {
      throw new Error(`Missing settings detail for ${page}`);
    }

    return detail;
  }

  it("renders a full-window master-detail workspace and changes settings pages", () => {
    act(() => {
      root.render(
        <SettingsPanel
          {...settingsPanelProps({
            appSettings: appSettings({ companionEnabled: true }),
            companionState: companionState({
              enabled: true,
              port: 48620,
              status: "running"
            })
          })}
        />
      );
    });

    const navigation = container.querySelector<HTMLElement>(
      'nav[aria-label="Settings sections"]'
    );
    const detail = container.querySelector<HTMLElement>(
      '[role="region"][aria-labelledby="settings-page-title"]'
    );
    const sidebar = container.querySelector<HTMLElement>("aside");
    const sidebarLabels = [
      ...(sidebar?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    ].map((button) => button.textContent.trim());
    const navigationLabels = [
      ...(navigation?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    ].map((button) => button.textContent.trim());
    const navigationAccessibleLabels = [
      ...(navigation?.querySelectorAll<HTMLButtonElement>("button") ?? [])
    ].map((button) => button.getAttribute("aria-label"));

    expect(sidebarLabels).toEqual([
      "Back to review",
      "General",
      "Review",
      "Repositories",
      "Phone companion"
    ]);
    expect(navigationLabels).toEqual([
      "General",
      "Review",
      "Repositories",
      "Phone companion"
    ]);
    expect(navigationAccessibleLabels).toEqual([
      "General",
      "Review",
      "Repositories",
      "Phone companion"
    ]);
    expect(sidebar?.contains(container.querySelector("#settings-title"))).toBe(false);
    expect(
      navigation?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.textContent
    ).toContain("General");
    expect(detail?.querySelector("#settings-page-title")?.textContent).toBe("General");
    expect(detail?.textContent).toContain("Appearance");
    expect(detail?.textContent).not.toContain("Default diff view");

    act(() => {
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(2)")?.click();
    });

    expect(detail?.querySelector("#settings-page-title")?.textContent).toBe("Review");
    expect(detail?.textContent).toContain("Default diff view");
    expect(detail?.textContent).not.toContain("Appearance");

    act(() => {
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(4)")?.click();
    });

    expect(detail?.querySelector("#settings-page-title")?.textContent).toBe(
      "Phone companion"
    );
    expect(detail?.textContent).toContain("Server running");
  });

  it("resets the detail scroll position when changing settings pages", () => {
    act(() => {
      root.render(
        <SettingsPanel
          {...settingsPanelProps({
            appSettings: appSettings({ companionEnabled: true }),
            companionState: companionState({
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
              status: "running"
            })
          })}
        />
      );
    });

    const navigation = container.querySelector<HTMLElement>(
      'nav[aria-label="Settings sections"]'
    );
    const scrollRegion = container.querySelector<HTMLElement>('[tabindex="0"]');

    expect(scrollRegion).not.toBeNull();
    if (!scrollRegion) return;

    act(() => {
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(4)")?.click();
    });
    scrollRegion.scrollTop = 240;
    act(() => {
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(1)")?.click();
    });

    expect(scrollRegion.scrollTop).toBe(0);
  });

  it("focuses the dialog, traps Tab, and restores the opener", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    act(() => {
      root.render(<SettingsPanel {...settingsPanelProps()} />);
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const buttons = [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const backButton = dialog?.querySelector<HTMLButtonElement>(
      '[aria-label="Back to review"]'
    );

    expect(document.activeElement).toBe(backButton);
    expect(buttons.length).toBeGreaterThan(1);

    const lastButton = buttons.at(-1);
    lastButton?.focus();
    const tab = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab"
    });

    act(() => {
      lastButton?.dispatchEvent(tab);
    });

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(backButton);

    act(() => root.unmount());

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("renders app settings sections and active values without form actions", () => {
    const input = settingsPanelProps({
      appSettings: appSettings({
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
      }),
      companionState: companionState({
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
      }),
      editorOptions: [
        editorOption({
          args: ["-b", "com.microsoft.VSCode", "{path}"],
          command: "open",
          id: "vscode",
          name: "VS Code"
        })
      ],
      repositorySearchRoots: [
        {
          enabled: true,
          id: "workspace",
          path: "/Users/example/Workspace",
          repositoryCount: 2,
          scanning: false
        }
      ]
    });

    const general = renderSettingsPage("general", input);

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Settings sections"]')).not.toBeNull();
    expect(general.tabIndex).toBe(-1);
    expect(general.innerHTML).toContain('value="dark"');
    expect(general.innerHTML).toContain('aria-label="Editor: VS Code"');

    const review = renderSettingsPage("review", input);

    expect(review.textContent).toContain("Default diff view");
    expect(review.textContent).toContain("Unified");
    expect(review.textContent).toContain("Wrap long lines");
    expect(review.textContent).toContain("Show generated files");
    expect(review.textContent).toContain("Notify when reviewed file drifts");

    const repositories = renderSettingsPage("repositories", input);

    expect(repositories.textContent).toContain("/Users/example/Workspace");

    const companion = renderSettingsPage("companion", input);

    expect(companion.textContent).toContain("port 48620");
    expect(companion.textContent).toContain("Local network");
    expect(companion.textContent).toContain("192.168.1.24:48620");
    expect(companion.textContent).toContain("Marco iPhone");
    expect(companion.textContent).toContain("Revoke");
    expect(companion.textContent).toContain("Pair new device");
    expect(container.textContent).not.toContain("Cancel");
    expect(container.textContent).not.toContain("Save");
    expect(container.querySelector('[aria-label="Back to review"]')).not.toBeNull();
  });

  it("disables controls while settings are saving", () => {
    const input = settingsPanelProps({
      disabled: true,
      repositorySearchRoots: [
        {
          enabled: true,
          id: "workspace",
          path: "/Users/example/Workspace",
          repositoryCount: 2,
          scanning: false
        }
      ],
      repositorySearchRootSuggestions: [
        {
          id: "projects",
          name: "Projects",
          path: "/Users/example/Projects"
        }
      ]
    });
    const general = renderSettingsPage("general", input);

    expect(
      general.querySelector<HTMLButtonElement>('[aria-label="Editor: System default"]')
        ?.disabled
    ).toBe(true);

    const repositories = renderSettingsPage("repositories", input);

    expect(
      repositories.querySelector<HTMLButtonElement>(
        '[aria-label="Remove /Users/example/Workspace"]'
      )?.disabled
    ).toBe(true);
    expect(repositories.textContent).not.toContain("Suggestions");
  });

  it("emits preference changes immediately and closes only from Back to review", () => {
    const onChangeAppSettings = vi.fn();
    const onClose = vi.fn();
    const general = renderSettingsPage("general", {
      onChangeAppSettings,
      onClose,
      platform: "darwin"
    });
    const appearance = general.querySelector<HTMLSelectElement>(
      'select[aria-label="Appearance"]'
    );

    act(() => {
      if (appearance) {
        appearance.value = "light";
        appearance.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const navigation = container.querySelector<HTMLElement>(
      'nav[aria-label="Settings sections"]'
    );
    act(() => {
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(2)")?.click();
    });
    act(() => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent.trim() === "Unified")
        ?.click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Back to review"]')
        ?.click();
    });

    expect(onChangeAppSettings).toHaveBeenNthCalledWith(1, { themeMode: "light" });
    expect(onChangeAppSettings).toHaveBeenNthCalledWith(2, {
      defaultDiffMode: "unified"
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Cancel");
    expect(container.textContent).not.toContain("Save");
    expect(container.querySelector('[data-platform="darwin"]')).not.toBeNull();
  });

  it("presents repository folders with the standard settings row hierarchy", () => {
    const repositories = renderSettingsPage("repositories", {
      onAddRepositorySearchRoot: vi.fn(),
      onAddSuggestedRepositorySearchRoot: vi.fn(),
      repositorySearchRootSuggestions: [
        {
          id: "workspace",
          name: "Workspace",
          path: "/Users/example/Workspace"
        }
      ]
    });

    expect(repositories.textContent).toContain("Search folders");
    expect(repositories.textContent).toContain("Suggestions");
    expect(repositories.textContent).toContain("Choose folder…");
    expect(
      repositories.querySelector(
        '[aria-label="Add suggested folder /Users/example/Workspace"]'
      )
    ).not.toBeNull();
  });

  it("hides suggested folders after a search folder is attached", () => {
    const repositories = renderSettingsPage("repositories", {
      repositorySearchRoots: [
        {
          enabled: true,
          id: "workspace",
          path: "/Users/example/Workspace",
          repositoryCount: 2,
          scanning: false
        }
      ],
      repositorySearchRootSuggestions: [
        {
          id: "projects",
          name: "Projects",
          path: "/Users/example/Projects"
        }
      ]
    });

    expect(repositories.textContent).not.toContain("Suggestions");
    expect(
      repositories.querySelector(
        '[aria-label="Add suggested folder /Users/example/Projects"]'
      )
    ).toBeNull();
  });

  it("shows live scan progress instead of making a new folder look idle", () => {
    const repositories = renderSettingsPage("repositories", {
      repositorySearchRoots: [
        {
          enabled: true,
          id: "workspace",
          path: "/Users/example/Workspace",
          repositoryCount: 0,
          scannedDirectories: 12,
          scanning: true,
          skippedDirectories: 3
        }
      ]
    });

    expect(repositories.querySelector('[role="status"]')).not.toBeNull();
    expect(repositories.textContent).toContain("Scanning folders");
    expect(repositories.textContent).toContain("12 checked");
    expect(repositories.innerHTML).toContain("loader-circle");
    expect(repositories.textContent).not.toContain("Not scanned yet");
  });

  it("collapses the companion section while disabled", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: false }),
      companionState: companionState({
        enabled: false,
        status: "stopped"
      })
    });

    expect(companion.textContent).toContain("Phone companion");
    expect(companion.textContent).toContain("Companion mode");
    expect(companion.textContent).not.toContain("Pair new device");
    expect(companion.textContent).not.toContain("Paired devices");
  });

  it("shows an optimistic companion disable while server state is catching up", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: false }),
      companionState: companionState({
        enabled: true,
        status: "running"
      })
    });
    const toggle = companion.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(toggle?.checked).toBe(false);
    expect(companion.textContent).not.toContain("Pair new device");
  });

  it("teaches first-time users how to install and pair the companion app", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({
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
      })
    });
    const html = companion.innerHTML;

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

  it("shows App Store references alongside Google Play", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({
        enabled: true,
        port: 48620,
        status: "running"
      })
    });
    const html = companion.innerHTML;

    expect(html).toContain("App Store");
    expect(html).toContain("Install <strong>Difftray Companion</strong> on your phone");
    expect(html).toContain("the App Store or Google Play");
  });

  it("keeps paired-device help compact in a closed accordion", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({
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
      })
    });
    const html = companion.innerHTML;

    expect(html).not.toContain("Review your changes from your phone");
    expect(html).toContain("iOS · Last seen never");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("How to connect a phone");
  });

  it("renders companion startup errors and pending pair requests", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({
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
      })
    });
    const html = companion.innerHTML;

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
        onClose={vi.fn()}
        onCancelCompanionPairing={vi.fn()}
        onChangeAppSettings={vi.fn()}
        onRespondToCompanionPairRequest={vi.fn()}
        onRevokeCompanionDevice={vi.fn()}
        onStartCompanionPairing={vi.fn()}
        onToggleCompanion={vi.fn()}
        platform="darwin"
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

function settingsPageLabel(
  page: "general" | "review" | "repositories" | "companion"
): string {
  if (page === "review") return "Review";
  if (page === "repositories") return "Repositories";
  if (page === "companion") return "Phone companion";

  return "General";
}

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

function settingsPanelProps(
  input: Partial<Parameters<typeof SettingsPanel>[0]> = {}
): Parameters<typeof SettingsPanel>[0] {
  return {
    appSettings: appSettings({}),
    companionPairing: null,
    companionState: companionState({}),
    disabled: false,
    editorOptions: [],
    onClose: vi.fn(),
    onCancelCompanionPairing: vi.fn(),
    onChangeAppSettings: vi.fn(),
    onRespondToCompanionPairRequest: vi.fn(),
    onRevokeCompanionDevice: vi.fn(),
    platform: "darwin",
    onStartCompanionPairing: vi.fn(),
    onToggleCompanion: vi.fn(),
    ...input
  };
}
