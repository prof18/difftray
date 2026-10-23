import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Copy,
  ExternalLink,
  FileDiff,
  FolderSearch,
  LoaderCircle,
  QrCode,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  X
} from "lucide-react";
import QRCode from "qrcode";

import type {
  AgentSetupInfo,
  AgentSkillStatus,
  AgentSkillTarget
} from "../shared/agent-setup-types.js";

import styles from "./settings-panel.module.css";
import { useDialogFocusTrap } from "./dialog-focus.js";
import {
  editorChoices,
  editorPatchForSelection,
  editorSelectionValue,
  type EditorChoice
} from "./editor-settings.js";
import { classList, themeModeFromValue } from "./review-view-model.js";

type SettingsPage = "general" | "review" | "repositories" | "agents" | "companion";

const settingsPages: readonly {
  readonly id: SettingsPage;
  readonly label: string;
}[] = [
  { id: "general", label: "General" },
  { id: "review", label: "Review" },
  { id: "repositories", label: "Repositories" },
  { id: "agents", label: "Agents" },
  { id: "companion", label: "Phone companion" }
];

export function SettingsPanel({
  appSettings,
  appVersion,
  companionPairing,
  companionState,
  disabled,
  editorOptions,
  onClose,
  onCancelCompanionPairing,
  onChangeAppSettings,
  onCheckForUpdates,
  onRespondToCompanionPairRequest,
  onRevokeCompanionDevice,
  onStartCompanionPairing,
  onToggleCompanion,
  platform,
  updatePhase = { kind: "idle" },
  repositorySearchRoots = [],
  repositorySearchRootSuggestions = [],
  onAddRepositorySearchRoot,
  onAddSuggestedRepositorySearchRoot,
  onCancelRepositoryScan,
  onRefreshRepositorySearchRoot,
  onRemoveRepositorySearchRoot
}: {
  readonly appSettings: AppSettingsView;
  readonly appVersion?: string | undefined;
  readonly companionPairing: CompanionPairingStateView | null;
  readonly companionState: CompanionStateView;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onClose: () => void;
  readonly onCancelCompanionPairing: () => void;
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
  readonly onCheckForUpdates?: () => void;
  readonly onRespondToCompanionPairRequest: (
    input: RespondToCompanionPairRequestInput
  ) => void;
  readonly onRevokeCompanionDevice: (id: string) => void;
  readonly onStartCompanionPairing: () => void;
  readonly onToggleCompanion: (enabled: boolean) => void;
  readonly platform: string;
  readonly updatePhase?: UpdatePhase;
  readonly repositorySearchRoots?: readonly RepositorySearchRootView[];
  readonly repositorySearchRootSuggestions?: readonly RepositorySearchRootSuggestionView[];
  readonly onAddRepositorySearchRoot?: () => void;
  readonly onAddSuggestedRepositorySearchRoot?: (suggestionId: string) => void;
  readonly onCancelRepositoryScan?: (rootId: string) => void;
  readonly onRefreshRepositorySearchRoot?: (rootId: string) => void;
  readonly onRemoveRepositorySearchRoot?: (rootId: string) => void;
}): React.JSX.Element {
  const activePairing = companionPairing ?? companionState.activePairing;
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const settingsWindowRef = useRef<HTMLElement>(null);
  const settingsScrollRegionRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(settingsWindowRef);

  useEffect(() => {
    if (settingsScrollRegionRef.current) {
      settingsScrollRegionRef.current.scrollTop = 0;
    }
  }, [activePage]);

  return (
    <div className={styles.settingsOverlay}>
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className={styles.settingsWindow}
        data-platform={platform}
        ref={settingsWindowRef}
        role="dialog"
      >
        <div className={styles.settingsContent}>
          <aside className={styles.settingsSidebar}>
            <button
              aria-label="Back to review"
              className={styles.settingsBackButton}
              disabled={disabled}
              onClick={onClose}
              type="button"
            >
              <ArrowLeft size={14} strokeWidth={1.4} aria-hidden />
              <span>Back to review</span>
            </button>
            <nav aria-label="Settings sections" className={styles.settingsNavigation}>
              {settingsPages.map((page) => (
                <button
                  aria-current={activePage === page.id ? "page" : undefined}
                  aria-label={page.label}
                  data-active={activePage === page.id}
                  key={page.id}
                  onClick={() => {
                    setActivePage(page.id);
                  }}
                  type="button"
                >
                  <SettingsNavigationIcon page={page.id} />
                  <span>{page.label}</span>
                  {page.id === "repositories" &&
                  repositorySearchRoots.some((root) => root.scanning) ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className={styles.settingsNavigationSpinner}
                      size={13}
                      strokeWidth={1.4}
                    />
                  ) : null}
                  {page.id === "companion" && companionState.status === "running" ? (
                    <span
                      aria-hidden="true"
                      className={styles.settingsNavigationStatus}
                    />
                  ) : null}
                </button>
              ))}
            </nav>
          </aside>

          <div className={styles.settingsMain}>
            <header className={styles.settingsTopline}>
              <h1 id="settings-title">Settings</h1>
            </header>
            <div
              aria-labelledby="settings-page-title"
              className={styles.settingsDetail}
              role="region"
            >
              <div
                className={styles.settingsScrollRegion}
                ref={settingsScrollRegionRef}
                tabIndex={0}
              >
                <div className={styles.settingsPageHeader}>
                  <h2 id="settings-page-title">
                    {settingsPages.find((page) => page.id === activePage)?.label}
                  </h2>
                </div>

                {activePage === "general" ? (
                  <GeneralSettingsPage
                    appSettings={appSettings}
                    appVersion={appVersion}
                    disabled={disabled}
                    editorOptions={editorOptions}
                    onChangeAppSettings={onChangeAppSettings}
                    onCheckForUpdates={onCheckForUpdates}
                    updatePhase={updatePhase}
                  />
                ) : null}

                {activePage === "review" ? (
                  <ReviewSettingsPage
                    appSettings={appSettings}
                    disabled={disabled}
                    onChangeAppSettings={onChangeAppSettings}
                  />
                ) : null}

                {activePage === "repositories" ? (
                  <RepositorySettingsPage
                    disabled={disabled}
                    onAddRepositorySearchRoot={onAddRepositorySearchRoot}
                    onAddSuggestedRepositorySearchRoot={
                      onAddSuggestedRepositorySearchRoot
                    }
                    onCancelRepositoryScan={onCancelRepositoryScan}
                    onRefreshRepositorySearchRoot={onRefreshRepositorySearchRoot}
                    onRemoveRepositorySearchRoot={onRemoveRepositorySearchRoot}
                    repositorySearchRoots={repositorySearchRoots}
                    repositorySearchRootSuggestions={repositorySearchRootSuggestions}
                  />
                ) : null}

                {activePage === "agents" ? (
                  <AgentsSettingsPage disabled={disabled} />
                ) : null}

                {activePage === "companion" ? (
                  <CompanionSettingsSection
                    appSettings={appSettings}
                    companionState={companionState}
                    disabled={disabled}
                    onRespondToPairRequest={onRespondToCompanionPairRequest}
                    onRevokeDevice={onRevokeCompanionDevice}
                    onStartPairing={onStartCompanionPairing}
                    onToggle={onToggleCompanion}
                    platform={platform}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {activePairing ? (
            <CompanionPairingDialog
              addresses={companionState.addresses}
              disabled={disabled}
              pairing={activePairing}
              onCancel={onCancelCompanionPairing}
              onGenerateNewCode={onStartCompanionPairing}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function SettingsNavigationIcon({
  page
}: {
  readonly page: SettingsPage;
}): React.JSX.Element {
  const iconProps = {
    "aria-hidden": true,
    size: 16,
    strokeWidth: 1.4
  } as const;

  if (page === "review") {
    return <FileDiff {...iconProps} />;
  }

  if (page === "repositories") {
    return <FolderSearch {...iconProps} />;
  }

  if (page === "agents") return <Bot {...iconProps} />;

  if (page === "companion") {
    return <Smartphone {...iconProps} />;
  }

  return <SlidersHorizontal {...iconProps} />;
}

function GeneralSettingsPage({
  appSettings,
  appVersion,
  disabled,
  editorOptions,
  onChangeAppSettings,
  onCheckForUpdates,
  updatePhase
}: {
  readonly appSettings: AppSettingsView;
  readonly appVersion: string | undefined;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
  readonly onCheckForUpdates: (() => void) | undefined;
  readonly updatePhase: UpdatePhase;
}): React.JSX.Element {
  const [checkRequested, setCheckRequested] = useState(false);
  const updateBusy =
    updatePhase.kind === "checking" ||
    updatePhase.kind === "available" ||
    updatePhase.kind === "downloading" ||
    updatePhase.kind === "downloaded";

  return (
    <>
      <SettingsSection title="Appearance">
        <label className={styles.settingRow}>
          <span>Appearance</span>
          <select
            aria-label="Appearance"
            disabled={disabled}
            onChange={(event) => {
              onChangeAppSettings({
                themeMode: themeModeFromValue(event.target.value)
              });
            }}
            value={appSettings.themeMode}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </SettingsSection>

      <SettingsSection allowOverflow title="Editor">
        <div className={styles.settingRow}>
          <span>Default editor</span>
          <EditorPicker
            appSettings={appSettings}
            disabled={disabled}
            editorOptions={editorOptions}
            onChangeAppSettings={onChangeAppSettings}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Updates">
        <div className={styles.settingRow}>
          <span className={styles.updateCopy}>
            <span>{appVersionLabel(appVersion)}</span>
            <span className={styles.updateStatus} role="status">
              {updateStatusText(updatePhase, checkRequested)}
            </span>
          </span>
          <button
            aria-label="Check for updates"
            className={styles.secondaryButton}
            disabled={updateBusy || !onCheckForUpdates}
            onClick={() => {
              setCheckRequested(true);
              onCheckForUpdates?.();
            }}
            type="button"
          >
            Check for updates
          </button>
        </div>
      </SettingsSection>
    </>
  );
}

/** The main process reports "development" for unpackaged builds. */
function appVersionLabel(appVersion: string | undefined): string {
  if (!appVersion) return "Difftray";
  if (appVersion === "development") return "Development build";
  return `Version ${appVersion}`;
}

function updateStatusText(phase: UpdatePhase, checkRequested: boolean): string {
  switch (phase.kind) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Version ${phase.version} is available`;
    case "downloading":
      return `Downloading version ${phase.version}…`;
    case "downloaded":
      return `Version ${phase.version} is ready to install`;
    case "error":
      return phase.message;
    case "idle":
      return checkRequested ? "Difftray is up to date" : "";
  }
}

const INTRO =
  "Let coding agents on this Mac open worktrees in Difftray, read your review feedback, and post findings for you to review.";
const ABOUT_TITLE = "About";
const SETUP_TITLE = "Set up an agent";
const STATUS_TITLE = "Status";
const TERMINAL_TITLE = "Terminal";
const OTHER_LABEL = "Other agents";
const INSTALL_NOTE =
  "Install links the bundled skill into your agent’s skills directory. Restart the agent after installing or repairing.";
const GUIDE_LABEL = "Full guide";
const CHECK_LABEL = "Check";
const CHECKING_LABEL = "Checking…";
const CONNECTED_LABEL = "Connected";
const CONNECTION_LABEL = "Agent connection";
const NOT_CHECKED_LABEL = "Not checked yet";

// The command-line row always states where the tool stands, so it never reads as an
// empty row when there is nothing to install.
function cliStateLabel(kind: CliInstallStatus["kind"]): string {
  switch (kind) {
    case "installed":
      return "Installed";
    case "absent":
      return "Not installed";
    case "repairable":
      return "Needs repair";
    case "blocked":
      return "Blocked";
    case "unavailable":
      return "Packaged builds only";
  }
}

function AgentsSettingsPage({
  disabled
}: {
  readonly disabled: boolean;
}): React.JSX.Element {
  const [setup, setSetup] = useState<AgentSetupInfo | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [installingTarget, setInstallingTarget] = useState<AgentSkillTarget | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkResult, setCheckResult] = useState<AgentCheckResult | null>(null);

  useEffect(() => {
    let active = true;
    void window.difftray
      .getAgentSetup()
      .then((result) => {
        if (active) setSetup(result);
      })
      .catch((error: unknown) => {
        if (active) setSetupError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  async function installSkill(target: AgentSkillTarget): Promise<void> {
    setSetupError(null);
    setInstallingTarget(target);
    try {
      setSetup(await window.difftray.installAgentSkill(target));
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setInstallingTarget(null);
    }
  }

  async function runCheck(): Promise<void> {
    setCheckBusy(true);
    setCheckResult(null);
    try {
      setCheckResult(await window.difftray.checkAgentConnection());
    } catch (error) {
      setCheckResult({
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setCheckBusy(false);
    }
  }

  function skillAction(skill: AgentSkillStatus): React.JSX.Element {
    const otherChoose =
      skill.target === "other" &&
      skill.kind !== "unavailable" &&
      skill.kind !== "repairable";
    const actionable =
      skill.kind === "absent" || skill.kind === "repairable" || otherChoose;
    const busy = installingTarget !== null;
    const buttonText =
      installingTarget === skill.target
        ? "Installing…"
        : otherChoose
          ? "Choose folder…"
          : skill.kind === "installed"
            ? "Installed"
            : skill.kind === "blocked"
              ? "Blocked"
              : skill.kind === "unavailable"
                ? "Unavailable"
                : skill.kind === "repairable"
                  ? "Repair"
                  : "Install";
    const label = skill.target === "other" ? OTHER_LABEL : skill.label;
    return (
      <div className={styles.agentActions}>
        {skill.target === "other" && skill.kind === "installed" ? (
          <span role="status">Installed</span>
        ) : null}
        <button
          aria-label={`${installingTarget === skill.target ? "Installing" : otherChoose ? "Choose folder for" : buttonText} ${label} skill`}
          className={styles.secondaryButton}
          disabled={disabled || busy || !actionable}
          onClick={() => {
            void installSkill(skill.target);
          }}
          type="button"
        >
          {buttonText}
        </button>
      </div>
    );
  }

  function reportSetupError(error: unknown): void {
    setSetupError(error instanceof Error ? error.message : String(error));
  }

  const [cliStatus, setCliStatus] = useState<CliInstallStatus | null>(null);
  const [cliBusy, setCliBusy] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.difftray
      .getCliInstallStatus()
      .then((status) => {
        if (active) setCliStatus(status);
      })
      .catch((error: unknown) => {
        if (active) setCliError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  async function installCli(): Promise<void> {
    setCliBusy(true);
    setCliError(null);
    try {
      setCliStatus(await window.difftray.installCli());
    } catch (error) {
      setCliError(error instanceof Error ? error.message : String(error));
    } finally {
      setCliBusy(false);
    }
  }

  return (
    <>
      <SettingsSection title={ABOUT_TITLE}>
        <div className={styles.settingRow}>
          <span>{INTRO}</span>
          <div className={styles.agentActions}>
            <button
              className={styles.secondaryButton}
              disabled={disabled}
              onClick={() => {
                void window.difftray.openAgentGuide().catch(reportSetupError);
              }}
              type="button"
            >
              {GUIDE_LABEL}
            </button>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title={SETUP_TITLE}>
        {setup?.available ? (
          <>
            {setup.skills.map((skill) => (
              <div key={skill.target}>
                <div className={styles.settingRow}>
                  <span>{skill.target === "other" ? OTHER_LABEL : skill.label}</span>
                  {skillAction(skill)}
                </div>
                {skill.destination || skill.reason ? (
                  <div className={styles.cliInstallDetails}>
                    {skill.destination ? (
                      <input
                        aria-label={`${skill.label} skill destination`}
                        readOnly
                        value={skill.destination}
                      />
                    ) : null}
                    {skill.reason ? <p>{skill.reason}</p> : null}
                  </div>
                ) : null}
              </div>
            ))}
            <div className={styles.cliInstallDetails}>
              <p>{INSTALL_NOTE}</p>
            </div>
          </>
        ) : setup ? (
          <div className={styles.cliInstallDetails}>
            <p>Agent setup is available in packaged builds.</p>
          </div>
        ) : null}
        {setupError ? (
          <p className={styles.cliInstallError} role="alert">
            {setupError}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection title={STATUS_TITLE}>
        <div className={styles.settingRow}>
          <span>{CONNECTION_LABEL}</span>
          <span className={styles.rowValueGroup}>
            <span className={styles.rowValue} role="status">
              {checkResult?.status === "connected"
                ? CONNECTED_LABEL
                : checkResult?.status === "failed"
                  ? "Not connected"
                  : NOT_CHECKED_LABEL}
            </span>
            <button
              className={styles.secondaryButton}
              disabled={disabled || checkBusy || !setup?.available}
              onClick={() => {
                void runCheck();
              }}
              type="button"
            >
              {checkBusy ? CHECKING_LABEL : CHECK_LABEL}
            </button>
          </span>
        </div>
        {checkResult?.status === "failed" ? (
          <p className={styles.cliInstallError} role="alert">
            {checkResult.message}
          </p>
        ) : null}
      </SettingsSection>
      <SettingsSection title={TERMINAL_TITLE}>
        <div className={styles.settingRow}>
          <span>Command-line tool</span>
          {cliStatus ? (
            <span className={styles.rowValueGroup}>
              <span className={styles.rowValue} data-cli-state={cliStatus.kind}>
                {cliStateLabel(cliStatus.kind)}
              </span>
              {cliStatus.kind === "absent" || cliStatus.kind === "repairable" ? (
                <button
                  className={styles.secondaryButton}
                  disabled={disabled || cliBusy}
                  onClick={() => {
                    void installCli();
                  }}
                  type="button"
                >
                  {cliStatus.kind === "repairable"
                    ? "Repair command-line tool"
                    : "Install command-line tool"}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {cliStatus ? (
          <div className={styles.cliInstallDetails}>
            {cliStatus.reason ? <p role="status">{cliStatus.reason}</p> : null}
            <label>
              Absolute command path
              <input
                aria-label="Absolute command path"
                readOnly
                value={
                  cliStatus.kind === "installed"
                    ? cliStatus.destination
                    : cliStatus.invocation
                }
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            {!cliStatus.onPath ? (
              <label>
                Add to terminal PATH if needed
                <input
                  aria-label="PATH instruction"
                  readOnly
                  value={cliStatus.pathInstruction ?? ""}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        {cliError ? (
          <p className={styles.cliInstallError} role="alert">
            {cliError}
          </p>
        ) : null}
      </SettingsSection>
    </>
  );
}

function ReviewSettingsPage({
  appSettings,
  disabled,
  onChangeAppSettings
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
}): React.JSX.Element {
  return (
    <>
      <SettingsSection title="Diff display">
        <div className={styles.settingRow}>
          <span>Default diff view</span>
          <div
            aria-label="Default diff view"
            className={styles.settingsSegmented}
            role="group"
          >
            <button
              data-active={appSettings.defaultDiffMode === "split"}
              disabled={disabled}
              onClick={() => {
                onChangeAppSettings({ defaultDiffMode: "split" });
              }}
              type="button"
            >
              Split
            </button>
            <button
              data-active={appSettings.defaultDiffMode === "unified"}
              disabled={disabled}
              onClick={() => {
                onChangeAppSettings({ defaultDiffMode: "unified" });
              }}
              type="button"
            >
              Unified
            </button>
          </div>
        </div>
        <ToggleRow
          checked={appSettings.wrapDiffLines}
          disabled={disabled}
          label="Wrap long lines"
          onChange={(checked) => {
            onChangeAppSettings({ wrapDiffLines: checked });
          }}
        />
        <ToggleRow
          checked={appSettings.showGeneratedFiles}
          disabled={disabled}
          label="Show generated files"
          onChange={(checked) => {
            onChangeAppSettings({ showGeneratedFiles: checked });
          }}
        />
      </SettingsSection>

      <SettingsSection title="Review workflow">
        <ToggleRow
          checked={appSettings.notifyOnDrift}
          disabled={disabled}
          label="Notify when a reviewed file changes"
          onChange={(checked) => {
            onChangeAppSettings({ notifyOnDrift: checked });
          }}
        />
      </SettingsSection>
    </>
  );
}

function RepositorySettingsPage({
  disabled,
  onAddRepositorySearchRoot,
  onAddSuggestedRepositorySearchRoot,
  onCancelRepositoryScan,
  onRefreshRepositorySearchRoot,
  onRemoveRepositorySearchRoot,
  repositorySearchRoots,
  repositorySearchRootSuggestions
}: {
  readonly disabled: boolean;
  readonly onAddRepositorySearchRoot: (() => void) | undefined;
  readonly onAddSuggestedRepositorySearchRoot:
    ((suggestionId: string) => void) | undefined;
  readonly onCancelRepositoryScan: ((rootId: string) => void) | undefined;
  readonly onRefreshRepositorySearchRoot: ((rootId: string) => void) | undefined;
  readonly onRemoveRepositorySearchRoot: ((rootId: string) => void) | undefined;
  readonly repositorySearchRoots: readonly RepositorySearchRootView[];
  readonly repositorySearchRootSuggestions: readonly RepositorySearchRootSuggestionView[];
}): React.JSX.Element {
  return (
    <SettingsSection title="Search folders">
      <div className={classList(styles.settingRow, styles.repositoryRootIntro)}>
        <div>
          <div className={styles.repositoryRootTitle}>Approved folders</div>
          <p>
            Only folders you approve are scanned. Git metadata, dependencies, build
            output, caches, and Trash are skipped automatically.
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          disabled={disabled}
          onClick={onAddRepositorySearchRoot}
          type="button"
        >
          Choose folder…
        </button>
      </div>
      {repositorySearchRoots.length === 0 &&
      repositorySearchRootSuggestions.length > 0 ? (
        <div className={styles.repositoryRootSuggestions}>
          <small>Suggestions</small>
          <div>
            {repositorySearchRootSuggestions.map((suggestion) => (
              <button
                aria-label={`Add suggested folder ${suggestion.path}`}
                disabled={disabled}
                key={suggestion.id}
                onClick={() => onAddSuggestedRepositorySearchRoot?.(suggestion.id)}
                title={suggestion.path}
                type="button"
              >
                {suggestion.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {repositorySearchRoots.map((root) => (
        <div
          className={classList(styles.settingRow, styles.repositoryRootRow)}
          key={root.id}
        >
          <div>
            <strong title={root.path}>{root.path}</strong>
            {root.scanning ? (
              <small className={styles.repositoryScanStatus} role="status">
                <LoaderCircle aria-hidden size={13} strokeWidth={1.4} />
                <span>
                  Scanning folders
                  {root.scannedDirectories
                    ? ` · ${String(root.scannedDirectories)} checked`
                    : "…"}
                </span>
              </small>
            ) : (
              <small>
                {root.repositoryCount} repositories ·{" "}
                {root.lastScanCompletedAt
                  ? `Last scanned ${new Date(root.lastScanCompletedAt).toLocaleString()}`
                  : "Not scanned yet"}
                {root.lastScanError ? ` · ${root.lastScanError}` : ""}
              </small>
            )}
          </div>
          <div className={styles.repositoryRootActions}>
            <button
              className={styles.secondaryButton}
              disabled={disabled}
              onClick={() =>
                root.scanning
                  ? onCancelRepositoryScan?.(root.id)
                  : onRefreshRepositorySearchRoot?.(root.id)
              }
              type="button"
            >
              {root.scanning ? (
                <X aria-hidden size={14} strokeWidth={1.4} />
              ) : (
                <RefreshCw aria-hidden size={13} strokeWidth={1.4} />
              )}
              {root.scanning ? "Cancel" : "Refresh"}
            </button>
            <button
              aria-label={`Remove ${root.path}`}
              className={classList(
                styles.secondaryButton,
                styles.repositoryRootIconButton
              )}
              disabled={disabled}
              onClick={() => onRemoveRepositorySearchRoot?.(root.id)}
              type="button"
            >
              <Trash2 size={13} strokeWidth={1.4} aria-hidden />
            </button>
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}

function CompanionSettingsSection({
  appSettings,
  companionState,
  disabled,
  onRespondToPairRequest,
  onRevokeDevice,
  onStartPairing,
  onToggle,
  platform
}: {
  readonly appSettings: AppSettingsView;
  readonly companionState: CompanionStateView;
  readonly disabled: boolean;
  readonly onRespondToPairRequest: (input: RespondToCompanionPairRequestInput) => void;
  readonly onRevokeDevice: (id: string) => void;
  readonly onStartPairing: () => void;
  readonly onToggle: (enabled: boolean) => void;
  readonly platform: string;
}): React.JSX.Element {
  const enabled = appSettings.companionEnabled;
  const companionAddresses = companionAddressLabels(companionState.addresses);
  const hasPairedDevices = companionState.devices.length > 0;

  return (
    <SettingsSection title="Connection">
      <div className={styles.companionIntro}>
        <div>
          <div className={styles.companionTitle}>Companion mode</div>
          {!hasPairedDevices ? (
            <p className={styles.companionDescription}>
              Review your changes from your phone. Browse projects, read diffs, and mark
              files reviewed while you&apos;re away from your desk — everything stays on
              your own devices.
            </p>
          ) : null}
        </div>
        <input
          aria-label="Enable companion mode"
          checked={enabled}
          className={styles.switch}
          disabled={disabled}
          onChange={(event) => {
            onToggle(event.target.checked);
          }}
          role="switch"
          title="Enable companion mode"
          type="checkbox"
        />
      </div>
      {enabled ? (
        <>
          <div className={styles.companionStatusRow}>
            <div>
              <div className={styles.companionStatusLabel}>
                {companionState.status === "running" ? (
                  <span className={styles.companionStatusDot} aria-hidden />
                ) : null}
                {companionStatusLabel(companionState)}
              </div>
              {companionAddresses.length > 0 ? (
                <div className={styles.companionAddressList}>
                  {companionAddresses.map((address) => (
                    <div key={address.value}>
                      <span>{address.label}</span>
                      <code>{address.value}</code>
                    </div>
                  ))}
                </div>
              ) : null}
              {companionState.errorMessage ? (
                <div className={styles.companionError}>{companionState.errorMessage}</div>
              ) : null}
            </div>
            <button
              className={styles.secondaryButton}
              disabled={disabled || companionState.status !== "running"}
              onClick={onStartPairing}
              title={
                companionState.status === "running"
                  ? undefined
                  : "Available once the server is running"
              }
              type="button"
            >
              <QrCode size={14} strokeWidth={1.4} aria-hidden />
              Pair new device
            </button>
          </div>
          {companionState.status === "running" && companionState.discovery ? (
            <div className={styles.companionStatusRow}>
              <div>
                <div className={styles.companionEyebrow}>Discovery</div>
                <div className={styles.companionStatusLabel}>
                  {companionDiscoveryLabel(companionState.discovery)}
                </div>
                {companionState.discovery.status === "advertising" ? (
                  <div className={styles.companionDescription}>
                    {companionState.discovery.name}
                  </div>
                ) : null}
              </div>
              {(companionState.discovery.status === "blocked" ||
                companionState.discovery.status === "failed") &&
              platform === "darwin" ? (
                <button
                  className={styles.secondaryButton}
                  disabled={disabled}
                  onClick={() => {
                    void window.difftray.openLocalNetworkSettings();
                  }}
                  type="button"
                >
                  Open Local Network settings
                </button>
              ) : null}
            </div>
          ) : null}
          {companionState.pendingPairRequests.length > 0 ? (
            <div className={styles.companionStack}>
              {companionState.pendingPairRequests.map((request) => (
                <div className={styles.companionPairRequest} key={request.id}>
                  <div>
                    <div className={styles.companionDeviceTitle}>
                      {request.deviceName} wants to pair
                    </div>
                    <div className={styles.companionFingerprint}>
                      {request.devicePublicKeyFingerprint}
                    </div>
                  </div>
                  <div className={styles.companionActions}>
                    <button
                      className={styles.secondaryButton}
                      disabled={disabled}
                      onClick={() => {
                        onRespondToPairRequest({ approved: false, id: request.id });
                      }}
                      type="button"
                    >
                      Deny
                    </button>
                    <button
                      className={styles.primaryButton}
                      disabled={disabled}
                      onClick={() => {
                        onRespondToPairRequest({ approved: true, id: request.id });
                      }}
                      type="button"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className={styles.companionDevices}>
            <div className={styles.companionDevicesHeader}>Paired devices</div>
            {hasPairedDevices ? (
              companionState.devices.map((device) => (
                <div className={styles.companionDeviceRow} key={device.id}>
                  <span className={styles.companionDeviceIcon}>
                    <Smartphone size={14} strokeWidth={1.4} aria-hidden />
                  </span>
                  <div>
                    <div className={styles.companionDeviceTitle}>{device.name}</div>
                    <div className={styles.companionDeviceMeta}>
                      {companionPlatformLabel(device.platform)} · {lastSeenLabel(device)}
                    </div>
                  </div>
                  <button
                    aria-label={`Revoke ${device.name}`}
                    className={styles.companionRevokeButton}
                    disabled={disabled}
                    onClick={() => {
                      onRevokeDevice(device.id);
                    }}
                    title="Revoke"
                    type="button"
                  >
                    <Trash2 size={13} strokeWidth={1.4} aria-hidden />
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <div className={styles.companionEmpty}>
                No paired devices yet — install the app and pair below.
              </div>
            )}
          </div>
          {hasPairedDevices ? (
            <details className={styles.companionHelp}>
              <summary>
                <CircleHelp size={16} strokeWidth={1.4} aria-hidden />
                <span>How to connect a phone</span>
                <ChevronRight
                  className={styles.companionHelpChevron}
                  size={16}
                  strokeWidth={1.4}
                  aria-hidden
                />
              </summary>
              <div className={styles.companionHelpBody}>
                <CompanionOnboarding />
              </div>
            </details>
          ) : (
            <CompanionOnboarding />
          )}
        </>
      ) : null}
    </SettingsSection>
  );
}

function CompanionOnboarding(): React.JSX.Element {
  const [selectedStore, setSelectedStore] = useState<CompanionStore | null>(null);

  return (
    <div className={styles.companionOnboarding}>
      <div className={styles.companionGetApp}>
        <div className={styles.companionOnboardingLabel}>Get the app</div>
        <div className={styles.companionStores}>
          <button
            aria-haspopup="dialog"
            className={styles.secondaryButton}
            onClick={() => {
              setSelectedStore("app-store");
            }}
            type="button"
          >
            App Store
          </button>
          <button
            aria-haspopup="dialog"
            className={styles.secondaryButton}
            onClick={() => {
              setSelectedStore("google-play");
            }}
            type="button"
          >
            Google Play
          </button>
        </div>
      </div>
      <div className={styles.companionSteps}>
        <div className={styles.companionOnboardingLabel}>How to connect your phone</div>
        <ol>
          <li>
            <span>1</span>
            <p>
              Install <strong>Difftray Companion</strong> on your phone from the App Store
              or Google Play.
            </p>
          </li>
          <li>
            <span>2</span>
            <p>
              Keep this Mac and your phone on the <strong>same Wi-Fi network</strong> — or
              use a <strong>private networking service</strong>, such as Tailscale, when
              you&apos;re away.
            </p>
          </li>
          <li>
            <span>3</span>
            <p>
              In the app, tap <strong>Pair a computer</strong> and scan the QR code shown
              by <code>Pair new device</code> above.
            </p>
          </li>
        </ol>
      </div>
      {selectedStore ? (
        <CompanionStoreDialog
          onClose={() => {
            setSelectedStore(null);
          }}
          store={selectedStore}
        />
      ) : null}
    </div>
  );
}

const companionStoreDetails: Record<
  CompanionStore,
  { readonly label: string; readonly url: string }
> = {
  "app-store": {
    label: "App Store",
    url: "https://apps.apple.com/pl/app/difftray-code-review-diff/id6789255782"
  },
  "google-play": {
    label: "Google Play",
    url: "https://play.google.com/store/apps/details?id=com.prof18.difftray.companion"
  }
};

function CompanionStoreDialog({
  onClose,
  store
}: {
  readonly onClose: () => void;
  readonly store: CompanionStore;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const details = companionStoreDetails[store];

  useEffect(() => {
    let cancelled = false;
    setCopied(false);
    setQrDataUrl(undefined);

    void QRCode.toDataURL(details.url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 208
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((caughtError: unknown) => {
        console.error("Failed to render store QR code", caughtError);
      });

    return () => {
      cancelled = true;
    };
  }, [details.url]);

  return (
    <section
      aria-label={`Get Difftray on ${details.label}`}
      aria-modal="true"
      className={styles.companionStoreDialog}
      role="dialog"
    >
      <div className={styles.companionStorePanel}>
        <div className={styles.companionStoreHeader}>
          <div>
            <div className={styles.companionEyebrow}>Get the app</div>
            <h3>Scan with your phone</h3>
          </div>
          <button
            aria-label="Close store QR code"
            className={styles.iconButton}
            onClick={onClose}
            type="button"
          >
            <X size={14} strokeWidth={1.4} aria-hidden />
          </button>
        </div>
        <div className={styles.companionStoreQrFrame}>
          {qrDataUrl ? (
            <img alt={`${details.label} download QR code`} src={qrDataUrl} />
          ) : (
            <div aria-label={`${details.label} download QR code`} />
          )}
        </div>
        <p>Scan to open Difftray on {details.label}.</p>
        <div className={styles.companionStoreActions}>
          <a
            href={details.url}
            onClick={(event) => {
              event.preventDefault();
              void window.difftray.openCompanionStore(store);
            }}
          >
            Open in {details.label}
            <ExternalLink size={12} strokeWidth={1.4} aria-hidden />
          </a>
          <button
            className={styles.secondaryButton}
            onClick={() => {
              void window.difftray.copyCompanionStoreLink(store).then(() => {
                setCopied(true);
              });
            }}
            type="button"
          >
            {copied ? (
              <Check size={13} strokeWidth={1.4} aria-hidden />
            ) : (
              <Copy size={13} strokeWidth={1.4} aria-hidden />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CompanionPairingDialog({
  addresses,
  disabled,
  pairing,
  onCancel,
  onGenerateNewCode
}: {
  readonly addresses: readonly CompanionAddressView[];
  readonly disabled: boolean;
  readonly pairing: CompanionPairingStateView;
  readonly onCancel: () => void;
  readonly onGenerateNewCode: () => void;
}): React.JSX.Element {
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());
  const countdown = pairingCountdown(pairing.expiresAt, now);
  const pairingAddresses = pairingAddressLabels(pairing, addresses);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(undefined);

    void QRCode.toDataURL(JSON.stringify(pairing.qrPayload), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 224
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch((caughtError: unknown) => {
        console.error("Failed to render companion QR code", caughtError);
      });

    return () => {
      cancelled = true;
    };
  }, [pairing.qrPayload]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section
      aria-label="Pair new phone"
      aria-modal="true"
      className={styles.companionPairingDialog}
      role="dialog"
    >
      <div className={styles.companionPairingPanel}>
        <div>
          <div className={styles.companionEyebrow}>Pairing QR code</div>
          <h3>Pair new device</h3>
        </div>
        <div className={styles.companionQrFrame}>
          {qrDataUrl ? (
            <img alt="Pairing QR code" draggable={false} src={qrDataUrl} />
          ) : (
            <div aria-label="Pairing QR code" className={styles.companionQrPending} />
          )}
        </div>
        <div className={styles.companionCodeBlock}>
          <span>Pairing code</span>
          <strong>{pairing.code}</strong>
          <small>{countdown}</small>
        </div>
        {pairingAddresses.length > 0 ? (
          <div className={styles.companionPairingAddresses}>
            <span>Computer address</span>
            {pairingAddresses.map((address) => (
              <div key={address.value}>
                <small>{address.label}</small>
                <code>{address.value}</code>
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.companionDialogActions}>
          <button
            className={styles.secondaryButton}
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            disabled={disabled}
            onClick={onGenerateNewCode}
            type="button"
          >
            Generate new code
          </button>
        </div>
      </div>
    </section>
  );
}

function SettingsSection({
  allowOverflow = false,
  children,
  title
}: {
  readonly allowOverflow?: boolean;
  readonly children: React.ReactNode;
  readonly title: string;
}): React.JSX.Element {
  return (
    <section
      className={styles.settingsSection}
      data-overflow={allowOverflow ? "visible" : undefined}
    >
      <div className={styles.sectionLabel}>{title}</div>
      <div
        className={styles.settingsCard}
        data-overflow={allowOverflow ? "visible" : undefined}
      >
        {children}
      </div>
    </section>
  );
}

function EditorPicker({
  appSettings,
  disabled,
  editorOptions,
  onChangeAppSettings
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const choices = useMemo(() => editorChoices(editorOptions), [editorOptions]);
  const selectedValue = editorSelectionValue(appSettings, editorOptions);
  const selectedChoice =
    choices.find((choice) => choice.value === selectedValue) ??
    ({
      label: "System default",
      value: "system"
    } satisfies EditorChoice);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent): void {
      const target = event.target;

      if (
        target instanceof Node &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  return (
    <div className={styles.editorPicker} ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Editor: ${selectedChoice.label}`}
        className={styles.editorPickerButton}
        disabled={disabled}
        onClick={() => {
          setOpen((isOpen) => !isOpen);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        type="button"
      >
        <EditorChoiceIcon choice={selectedChoice} />
        <span>{selectedChoice.label}</span>
        <ChevronDown size={14} strokeWidth={1.4} aria-hidden />
      </button>
      {open ? (
        <div aria-label="Editor" className={styles.editorPickerMenu} role="listbox">
          {choices.map((choice) => (
            <button
              aria-selected={choice.value === selectedValue}
              className={styles.editorPickerOption}
              data-selected={choice.value === selectedValue}
              key={choice.value}
              onClick={() => {
                onChangeAppSettings(editorPatchForSelection(choice.value, editorOptions));
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <EditorChoiceIcon choice={choice} />
              <span>{choice.label}</span>
              {choice.value === selectedValue ? (
                <Check size={13} strokeWidth={1.4} aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditorChoiceIcon({
  choice
}: {
  readonly choice: EditorChoice;
}): React.JSX.Element {
  if (choice.iconDataUrl) {
    return (
      <img
        alt=""
        className={styles.editorPickerIcon}
        draggable={false}
        src={choice.iconDataUrl}
      />
    );
  }

  return (
    <span className={styles.editorPickerIcon} data-fallback="true">
      <Code2 size={14} strokeWidth={1.4} aria-hidden />
    </span>
  );
}

function ToggleRow({
  checked,
  disabled = false,
  label,
  onChange
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className={styles.settingRow}>
      <span>{label}</span>
      <input
        checked={checked}
        className={styles.switch}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        role="switch"
        type="checkbox"
      />
    </label>
  );
}

function companionStatusLabel(state: CompanionStateView): string {
  if (state.status === "running" && state.port) {
    return `Server running · port ${String(state.port)}`;
  }

  if (state.status === "error") {
    return "Server failed to start";
  }

  // The label only shows while companion mode is on, so a stopped server is
  // still on its way up rather than switched off.
  return "Starting server…";
}

function companionDiscoveryLabel(state: CompanionDiscoveryStateView): string {
  switch (state.status) {
    case "advertising":
      return "Visible on the local network";
    case "blocked":
      return "Not visible on the local network. Local Network access may be off for this app.";
    case "failed":
      return "Not visible on the local network.";
    case "starting":
      return "Starting…";
  }
}

function companionPlatformLabel(platform: string): string {
  if (platform.toLowerCase() === "ios") {
    return "iOS";
  }

  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function companionAddressLabels(
  addresses: readonly CompanionAddressView[]
): readonly { readonly label: string; readonly value: string }[] {
  return addresses.map((address) => ({
    label: address.isTailscale ? "Tailscale" : "Local network",
    value: address.address
  }));
}

function pairingAddressLabels(
  pairing: CompanionPairingStateView,
  addresses: readonly CompanionAddressView[]
): readonly { readonly label: string; readonly value: string }[] {
  const knownAddresses = new Map(
    addresses.map((address) => [normalizeCompanionAddress(address.address), address])
  );

  return pairing.qrPayload.addresses.map((rawAddress) => {
    const value = normalizeCompanionAddress(rawAddress);
    const knownAddress = knownAddresses.get(value);

    return {
      label: knownAddress?.isTailscale ? "Tailscale" : "Local network",
      value
    };
  });
}

function normalizeCompanionAddress(address: string): string {
  try {
    const parsed = new URL(address);

    return parsed.host;
  } catch {
    return address;
  }
}

function pairingCountdown(expiresAt: string, now: number): string {
  const expiresAtMs = Date.parse(expiresAt);

  if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
    return "Expired";
  }

  const remainingSeconds = Math.max(1, Math.ceil((expiresAtMs - now) / 1_000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  if (minutes <= 0) {
    return `Expires in ${String(seconds)}s`;
  }

  return `Expires in ${String(minutes)}m ${seconds.toString().padStart(2, "0")}s`;
}

function lastSeenLabel(device: CompanionDeviceView): string {
  if (!device.lastSeenAt) {
    return "Last seen never";
  }

  const lastSeen = new Date(device.lastSeenAt);

  if (Number.isNaN(lastSeen.getTime())) {
    return "Last seen unknown";
  }

  return `Last seen ${lastSeen.toLocaleString()}`;
}
