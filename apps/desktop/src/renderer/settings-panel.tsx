import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  QrCode,
  Save,
  Smartphone,
  Trash2,
  X
} from "lucide-react";
import QRCode from "qrcode";

import styles from "./settings-panel.module.css";
import {
  editorChoices,
  editorPatchForSelection,
  editorSelectionValue,
  type EditorChoice
} from "./editor-settings.js";
import { themeModeFromValue } from "./review-view-model.js";

export function SettingsPanel({
  appSettings,
  companionPairing,
  companionState,
  disabled,
  editorOptions,
  onCancel,
  onCancelCompanionPairing,
  onChangeAppSettings,
  onRespondToCompanionPairRequest,
  onRevokeCompanionDevice,
  onSave,
  onStartCompanionPairing,
  onToggleCompanion
}: {
  readonly appSettings: AppSettingsView;
  readonly companionPairing: CompanionPairingStateView | null;
  readonly companionState: CompanionStateView;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onCancel: () => void;
  readonly onCancelCompanionPairing: () => void;
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
  readonly onRespondToCompanionPairRequest: (
    input: RespondToCompanionPairRequestInput
  ) => void;
  readonly onRevokeCompanionDevice: (id: string) => void;
  readonly onSave: () => void;
  readonly onStartCompanionPairing: () => void;
  readonly onToggleCompanion: (enabled: boolean) => void;
}): React.JSX.Element {
  const activePairing = companionPairing ?? companionState.activePairing;

  return (
    <div className={styles.settingsOverlay}>
      <section className={styles.settingsWindow} aria-modal="true" role="dialog">
        <form
          className={styles.settingsContent}
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className={styles.settingsTopline}>
            <div>
              <h2>Settings</h2>
              <p>App appearance, editor launch, and review behavior.</p>
            </div>
            <button
              aria-label="Close settings"
              className={styles.iconButton}
              disabled={disabled}
              onClick={onCancel}
              title="Close"
              type="button"
            >
              <X size={14} strokeWidth={1.4} aria-hidden />
            </button>
          </div>

          <div
            aria-label="Settings options"
            className={styles.settingsScrollRegion}
            role="region"
            tabIndex={0}
          >
            <SettingsSection title="General">
              <label className={styles.settingRow}>
                <span>Appearance</span>
                <select
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
                <span>Editor</span>
                <EditorPicker
                  appSettings={appSettings}
                  disabled={disabled}
                  editorOptions={editorOptions}
                  onChangeAppSettings={onChangeAppSettings}
                />
              </div>
            </SettingsSection>

            <CompanionSettingsSection
              appSettings={appSettings}
              companionState={companionState}
              disabled={disabled}
              onRespondToPairRequest={onRespondToCompanionPairRequest}
              onRevokeDevice={onRevokeCompanionDevice}
              onStartPairing={onStartCompanionPairing}
              onToggle={onToggleCompanion}
            />

            {activePairing ? (
              <CompanionPairingDialog
                addresses={companionState.addresses}
                disabled={disabled}
                pairing={activePairing}
                onCancel={onCancelCompanionPairing}
                onGenerateNewCode={onStartCompanionPairing}
              />
            ) : null}

            <SettingsSection title="Review">
              <div className={styles.settingRow}>
                <span>Default diff view</span>
                <div
                  className={styles.settingsSegmented}
                  role="group"
                  aria-label="Default diff view"
                >
                  <button
                    data-active={appSettings.defaultDiffMode === "split"}
                    onClick={() => {
                      onChangeAppSettings({ defaultDiffMode: "split" });
                    }}
                    type="button"
                  >
                    Split
                  </button>
                  <button
                    data-active={appSettings.defaultDiffMode === "unified"}
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
                label="Wrap long lines"
                onChange={(checked) => {
                  onChangeAppSettings({ wrapDiffLines: checked });
                }}
              />
              <ToggleRow
                checked={appSettings.showGeneratedFiles}
                label="Show generated files"
                onChange={(checked) => {
                  onChangeAppSettings({ showGeneratedFiles: checked });
                }}
              />
              <ToggleRow
                checked={appSettings.notifyOnDrift}
                label="Notify when reviewed file drifts"
                onChange={(checked) => {
                  onChangeAppSettings({ notifyOnDrift: checked });
                }}
              />
            </SettingsSection>

            <div className={styles.settingsActions}>
              <button
                className={styles.secondaryButton}
                disabled={disabled}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
              <button className={styles.primaryButton} disabled={disabled} type="submit">
                <Save size={14} strokeWidth={1.4} aria-hidden />
                Save
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function CompanionSettingsSection({
  appSettings,
  companionState,
  disabled,
  onRespondToPairRequest,
  onRevokeDevice,
  onStartPairing,
  onToggle
}: {
  readonly appSettings: AppSettingsView;
  readonly companionState: CompanionStateView;
  readonly disabled: boolean;
  readonly onRespondToPairRequest: (input: RespondToCompanionPairRequestInput) => void;
  readonly onRevokeDevice: (id: string) => void;
  readonly onStartPairing: () => void;
  readonly onToggle: (enabled: boolean) => void;
}): React.JSX.Element {
  const enabled = companionState.enabled || appSettings.companionEnabled;
  const companionAddresses = companionAddressLabels(companionState.addresses);

  return (
    <SettingsSection title="Phone companion">
      <ToggleRow
        checked={enabled}
        disabled={disabled}
        label="Enable companion server"
        onChange={onToggle}
      />
      {enabled ? (
        <>
          <div className={styles.companionStatusRow}>
            <div>
              <div className={styles.companionStatusLabel}>
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
              type="button"
            >
              <QrCode size={14} strokeWidth={1.5} aria-hidden />
              Pair new device
            </button>
          </div>
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
            {companionState.devices.length > 0 ? (
              companionState.devices.map((device) => (
                <div className={styles.companionDeviceRow} key={device.id}>
                  <span className={styles.companionDeviceIcon}>
                    <Smartphone size={14} strokeWidth={1.5} aria-hidden />
                  </span>
                  <div>
                    <div className={styles.companionDeviceTitle}>{device.name}</div>
                    <div className={styles.companionDeviceMeta}>
                      {device.platform} - {lastSeenLabel(device)}
                    </div>
                  </div>
                  <button
                    aria-label={`Revoke ${device.name}`}
                    className={styles.iconButton}
                    disabled={disabled}
                    onClick={() => {
                      onRevokeDevice(device.id);
                    }}
                    title="Revoke"
                    type="button"
                  >
                    <Trash2 size={13} strokeWidth={1.5} aria-hidden />
                  </button>
                  <span className={styles.companionRevokeLabel}>Revoke</span>
                </div>
              ))
            ) : (
              <div className={styles.companionEmpty}>No paired devices</div>
            )}
          </div>
        </>
      ) : null}
    </SettingsSection>
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
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
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
                <Check size={13} strokeWidth={1.6} aria-hidden />
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
      <Code2 size={14} strokeWidth={1.5} aria-hidden />
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
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        type="checkbox"
      />
    </label>
  );
}

function companionStatusLabel(state: CompanionStateView): string {
  if (state.status === "running" && state.port) {
    return `Running - Port ${String(state.port)}`;
  }

  if (state.status === "error") {
    return "Server failed to start";
  }

  return "Server stopped";
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
