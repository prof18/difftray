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
    Object.defineProperty(window, "difftray", {
      configurable: true,
      value: {
        getAgentSetup: vi.fn().mockResolvedValue({
          available: true,
          skills: [
            {
              target: "claude",
              label: "Claude Code",
              destination: "/Users/test/.claude/skills/difftray",
              kind: "absent",
              reason: null
            },
            {
              target: "codex",
              label: "Codex",
              destination: "/Users/test/.codex/skills/difftray",
              kind: "repairable",
              reason: "The installed skill link points to a missing location."
            },
            {
              target: "pi",
              label: "Pi",
              destination: "/Users/test/.pi/agent/skills/difftray",
              kind: "installed",
              reason: null
            },
            {
              target: "other",
              label: "Other agents",
              destination: null,
              kind: "absent",
              reason: null
            }
          ]
        }),
        installAgentSkill: vi.fn().mockResolvedValue({ available: true, skills: [] }),
        checkAgentConnection: vi.fn().mockResolvedValue({ status: "connected" }),
        openAgentGuide: vi.fn().mockResolvedValue(undefined),
        getCliInstallStatus: vi.fn().mockResolvedValue({
          kind: "absent",
          command: "difftray",
          destination: "/Users/test/.local/bin/difftray",
          invocation: "/Applications/Difftray.app/Contents/Resources/bin/difftray",
          onPath: false,
          pathInstruction: 'export PATH="/Users/test/.local/bin:$PATH"',
          reason: null
        }),
        installCli: vi.fn().mockResolvedValue({
          kind: "installed",
          command: "difftray",
          destination: "/Users/test/.local/bin/difftray",
          invocation: "/Applications/Difftray.app/Contents/Resources/bin/difftray",
          onPath: false,
          pathInstruction: 'export PATH="/Users/test/.local/bin:$PATH"',
          reason: null
        })
      }
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderSettingsPage(
    page: "general" | "review" | "repositories" | "agents" | "companion",
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

  function section(detail: HTMLElement, title: string): HTMLElement {
    const result = [...detail.querySelectorAll<HTMLElement>("section")].find(
      (item) => item.firstElementChild?.textContent === title
    );
    if (!result) throw new Error(`Missing section ${title}`);
    return result;
  }
  function buttonNamed(parent: HTMLElement, name: string): HTMLButtonElement {
    const result = [...parent.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === name
    );
    if (!result) throw new Error(`Missing button ${name}`);
    return result;
  }
  async function readyAgents(): Promise<HTMLElement> {
    const detail = renderSettingsPage("agents");
    await act(async () => {
      await Promise.resolve();
    });
    return detail;
  }
  it("shows install, repair, installed, and unavailable states with destinations", async () => {
    const setup = section(await readyAgents(), "Set up an agent");
    expect(setup.textContent).toContain(
      "Install links the bundled skill into your agent’s skills directory. Restart the agent after installing or repairing."
    );
    expect(buttonNamed(setup, "Install").getAttribute("aria-label")).toBe(
      "Install Claude Code skill"
    );
    expect(buttonNamed(setup, "Repair").getAttribute("aria-label")).toBe(
      "Repair Codex skill"
    );
    expect(buttonNamed(setup, "Installed").disabled).toBe(true);
    expect(setup.textContent).toContain(
      "The installed skill link points to a missing location."
    );
    expect(
      [...setup.querySelectorAll<HTMLInputElement>("input")].map((input) => input.value)
    ).toContain("/Users/test/.codex/skills/difftray");
    expect(setup.textContent).not.toContain("github.com");
    expect(setup.textContent).not.toContain("DIFFTRAY_APP_PATH");
  });
  it("keeps blocked and unavailable targets disabled and explains why", async () => {
    vi.mocked(window.difftray.getAgentSetup).mockResolvedValue({
      available: true,
      skills: [
        {
          target: "claude",
          label: "Claude Code",
          destination: "/skills/claude",
          kind: "blocked",
          reason: "The destination is a regular file."
        },
        {
          target: "codex",
          label: "Codex",
          destination: "/skills/codex",
          kind: "unavailable",
          reason: "The agent skills directory could not be inspected."
        }
      ]
    });
    const setup = section(await readyAgents(), "Set up an agent");
    expect(buttonNamed(setup, "Blocked").disabled).toBe(true);
    expect(buttonNamed(setup, "Unavailable").disabled).toBe(true);
    expect(setup.textContent).toContain("The destination is a regular file.");
    expect(setup.textContent).toContain(
      "The agent skills directory could not be inspected."
    );
  });
  it.each(["blocked", "installed"] as const)(
    "lets Other agents choose a new folder when its saved destination is %s",
    async (kind) => {
      vi.mocked(window.difftray.getAgentSetup).mockResolvedValue({
        available: true,
        skills: [
          {
            target: "other",
            label: "Other agents",
            destination: "/custom/difftray",
            kind,
            reason: kind === "blocked" ? "The selected folder is not writable." : null
          }
        ]
      });
      const setup = section(await readyAgents(), "Set up an agent");
      const chooseFolder = setup.querySelector<HTMLButtonElement>(
        'button[aria-label="Choose folder for Other agents skill"]'
      );
      if (kind === "blocked")
        expect(setup.textContent).toContain("The selected folder is not writable.");
      expect(chooseFolder?.disabled).toBe(false);
      await act(async () => {
        chooseFolder?.click();
        await Promise.resolve();
      });
      expect(window.difftray.installAgentSkill).toHaveBeenLastCalledWith("other");
    }
  );
  it("installs each supported target and refreshes returned statuses", async () => {
    for (const [target, label] of [
      ["claude", "Install Claude Code skill"],
      ["codex", "Repair Codex skill"],
      ["pi", "Install Pi skill"],
      ["other", "Choose folder for Other agents skill"]
    ] as const) {
      const allTargets = ["claude", "codex", "pi", "other"] as const;
      const refreshed: AgentSetupInfo = {
        available: true,
        skills: allTargets.map((item) => ({
          target: item,
          label:
            item === "claude"
              ? "Claude Code"
              : item === "codex"
                ? "Codex"
                : item === "pi"
                  ? "Pi"
                  : "Other agents",
          destination: `/${item}/difftray`,
          kind:
            item === target ? "installed" : item === "codex" ? "repairable" : "absent",
          reason: null
        }))
      };
      const initial: AgentSetupInfo = {
        available: true,
        skills: allTargets.map((item) => ({
          target: item,
          label:
            item === "claude"
              ? "Claude Code"
              : item === "codex"
                ? "Codex"
                : item === "pi"
                  ? "Pi"
                  : "Other agents",
          destination: `/${item}/difftray`,
          kind:
            item === target ? (item === "codex" ? "repairable" : "absent") : "installed",
          reason: null
        }))
      };
      vi.mocked(window.difftray.getAgentSetup).mockResolvedValue(initial);
      vi.mocked(window.difftray.installAgentSkill).mockResolvedValue(refreshed);
      const setup = section(await readyAgents(), "Set up an agent");
      const button = setup.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`
      );
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
      expect(window.difftray.installAgentSkill).toHaveBeenLastCalledWith(target);
      expect(setup.textContent).toContain("Installed");
      act(() => {
        container.querySelector<HTMLButtonElement>("nav button")?.click();
      });
    }
  });
  it("disables every install action while one target is installing", async () => {
    let finish!: (value: AgentSetupInfo) => void;
    vi.mocked(window.difftray.installAgentSkill).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const setup = section(await readyAgents(), "Set up an agent");
    act(() => {
      buttonNamed(setup, "Install").click();
    });
    expect(buttonNamed(setup, "Installing…").disabled).toBe(true);
    expect(buttonNamed(setup, "Repair").disabled).toBe(true);
    await act(async () => {
      finish({ available: true, skills: [] });
      await Promise.resolve();
    });
  });
  it("reports installation errors and lets Other agents choose a folder", async () => {
    vi.mocked(window.difftray.installAgentSkill).mockRejectedValueOnce(
      new Error("Permission denied")
    );
    const setup = section(await readyAgents(), "Set up an agent");
    await act(async () => {
      buttonNamed(setup, "Install").click();
      await Promise.resolve();
    });
    expect(setup.querySelector('[role="alert"]')?.textContent).toBe("Permission denied");
    await act(async () => {
      setup
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Choose folder for Other agents skill"]'
        )
        ?.click();
      await Promise.resolve();
    });
    expect(window.difftray.installAgentSkill).toHaveBeenLastCalledWith("other");
  });
  it("checks the connection and displays connected or the CLI error in Status", async () => {
    const status = section(await readyAgents(), "Status");
    await act(async () => {
      buttonNamed(status, "Check").click();
      await Promise.resolve();
    });
    expect(status.textContent).toContain("Connected");
    vi.mocked(window.difftray.checkAgentConnection).mockResolvedValue({
      status: "failed",
      message: "Desktop startup timeout"
    });
    await act(async () => {
      buttonNamed(status, "Check").click();
      await Promise.resolve();
    });
    expect(status.querySelector('[role="alert"]')?.textContent).toBe(
      "Desktop startup timeout"
    );
  });
  it("allows only one pending connection check", async () => {
    let finish!: (value: AgentCheckResult) => void;
    vi.mocked(window.difftray.checkAgentConnection).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const status = section(await readyAgents(), "Status");
    act(() => {
      buttonNamed(status, "Check").click();
    });
    const checking = buttonNamed(status, "Checking…");
    expect(checking.disabled).toBe(true);
    act(() => {
      checking.click();
    });
    expect(window.difftray.checkAgentConnection).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ status: "connected" });
      await Promise.resolve();
    });
  });
  it("shows packaged-only setup without Copy buttons in development", async () => {
    vi.mocked(window.difftray.getAgentSetup).mockResolvedValue({ available: false });
    const detail = await readyAgents();
    expect(detail.textContent).toContain("Agent setup is available in packaged builds.");
    expect(
      [...detail.querySelectorAll("button")].some((item) => item.textContent === "Copy")
    ).toBe(false);
  });
  it("opens the full agent guide", async () => {
    const detail = await readyAgents();
    await act(async () => {
      buttonNamed(detail, "Full guide").click();
      await Promise.resolve();
    });
    expect(window.difftray.openAgentGuide).toHaveBeenCalledOnce();
  });

  it("reads terminal status without installing until the user clicks", async () => {
    expect(renderSettingsPage("general").textContent).not.toContain("Command-line tool");
    const general = renderSettingsPage("agents");
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.difftray.getCliInstallStatus).toHaveBeenCalledOnce();
    expect(window.difftray.installCli).not.toHaveBeenCalled();
    expect(general.textContent).toContain("Install command-line tool");
    const button = [...general.querySelectorAll<HTMLButtonElement>("button")].find(
      (item) => item.textContent === "Install command-line tool"
    );
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(window.difftray.installCli).toHaveBeenCalledOnce();
    expect(general.textContent).toContain("Command-line tool installed");
    expect(
      general.querySelector<HTMLInputElement>('input[aria-label="Absolute command path"]')
        ?.value
    ).toBe("/Users/test/.local/bin/difftray");
  });

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
      "Agents",
      "Phone companion"
    ]);
    expect(navigationLabels).toEqual([
      "General",
      "Review",
      "Repositories",
      "Agents",
      "Phone companion"
    ]);
    expect(navigationAccessibleLabels).toEqual([
      "General",
      "Review",
      "Repositories",
      "Agents",
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
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(5)")?.click();
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
      navigation?.querySelector<HTMLButtonElement>("button:nth-of-type(5)")?.click();
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

    const lastButton = buttons.filter((button) => !button.disabled).at(-1);
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

  it("offers the update check on the General page", () => {
    const onCheckForUpdates = vi.fn();
    const general = renderSettingsPage("general", {
      appVersion: "1.4.2",
      onCheckForUpdates,
      updatePhase: { kind: "idle" }
    });

    expect(general.textContent).toContain("Updates");
    expect(general.textContent).toContain("Version 1.4.2");
    const button = general.querySelector<HTMLButtonElement>(
      'button[aria-label="Check for updates"]'
    );
    expect(button?.disabled).toBe(false);

    act(() => {
      button?.click();
    });

    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it("describes update progress and disables the check while it runs", () => {
    const checking = renderSettingsPage("general", {
      appVersion: "1.4.2",
      onCheckForUpdates: vi.fn(),
      updatePhase: { kind: "checking" }
    });

    expect(checking.textContent).toContain("Checking for updates");
    expect(
      checking.querySelector<HTMLButtonElement>('button[aria-label="Check for updates"]')
        ?.disabled
    ).toBe(true);

    const ready = renderSettingsPage("general", {
      appVersion: "1.4.2",
      onCheckForUpdates: vi.fn(),
      updatePhase: { kind: "downloaded", version: "1.5.0" }
    });

    expect(ready.textContent).toContain("Version 1.5.0 is ready to install");
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

  it("renders on/off settings as switches", () => {
    const review = renderSettingsPage("review");
    const wrap = [...review.querySelectorAll<HTMLInputElement>("input")].find((input) =>
      input.closest("label")?.textContent.includes("Wrap long lines")
    );

    expect(wrap?.getAttribute("role")).toBe("switch");

    const companion = renderSettingsPage("companion");
    const toggle = companion.querySelector<HTMLInputElement>(
      'input[aria-label="Enable companion mode"]'
    );

    expect(toggle?.getAttribute("role")).toBe("switch");
  });

  it("says the server is starting while companion mode waits for it", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({ enabled: true, status: "stopped" })
    });
    const pairButton = [...companion.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent.includes("Pair new device")
    );

    expect(companion.textContent).toContain("Starting server…");
    expect(companion.textContent).not.toContain("Server stopped");
    expect(pairButton?.disabled).toBe(true);
    expect(pairButton?.title).toBe("Available once the server is running");
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

  it.each([
    {
      discovery: { name: "Marco’s MacBook (Alpha)", status: "advertising" } as const,
      text: "Visible on the local network"
    },
    {
      discovery: {
        errorCode: "local_network_probe",
        name: "Marco’s MacBook (Alpha)",
        status: "blocked"
      } as const,
      text: "Not visible on the local network. Local Network access may be off for this app."
    },
    {
      discovery: {
        errorCode: "not_published",
        name: "Marco’s MacBook (Alpha)",
        status: "failed"
      } as const,
      text: "Not visible on the local network."
    },
    {
      discovery: { name: "Marco’s MacBook (Alpha)", status: "starting" } as const,
      text: "Starting…"
    }
  ])("shows $discovery.status companion discovery state", ({ discovery, text }) => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({
        discovery,
        enabled: true,
        port: 48620,
        status: "running"
      })
    });

    expect(companion.textContent).toContain("Discovery");
    expect(companion.textContent).toContain(text);
    if (discovery.status === "advertising") {
      expect(companion.textContent).toContain("Marco’s MacBook (Alpha)");
    }
  });

  it("opens Local Network settings for blocked discovery on macOS", () => {
    const openLocalNetworkSettings = vi.fn<() => Promise<void>>().mockResolvedValue();
    const originalDifftray = window.difftray;
    Object.defineProperty(window, "difftray", {
      configurable: true,
      value: { ...originalDifftray, openLocalNetworkSettings }
    });

    try {
      const companion = renderSettingsPage("companion", {
        appSettings: appSettings({ companionEnabled: true }),
        companionState: companionState({
          discovery: {
            errorCode: "local_network_probe",
            name: "Marco’s MacBook (Alpha)",
            status: "blocked"
          },
          enabled: true,
          port: 48620,
          status: "running"
        }),
        platform: "darwin"
      });
      const button = [...companion.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent.trim() === "Open Local Network settings"
      );

      expect(button).toBeDefined();
      act(() => button?.click());
      expect(openLocalNetworkSettings).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(window, "difftray", {
        configurable: true,
        value: originalDifftray
      });
    }
  });

  it("does not offer Local Network settings outside macOS", () => {
    const companion = renderSettingsPage("companion", {
      appSettings: appSettings({ companionEnabled: true }),
      companionState: companionState({
        discovery: {
          errorCode: "local_network_probe",
          name: "Linux workstation (Alpha)",
          status: "blocked"
        },
        enabled: true,
        port: 48620,
        status: "running"
      }),
      platform: "linux"
    });

    expect(companion.textContent).not.toContain("Open Local Network settings");
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
  page: "general" | "review" | "repositories" | "agents" | "companion"
): string {
  if (page === "agents") return "Agents";
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
