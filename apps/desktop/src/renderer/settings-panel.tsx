import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Code2, Save, X } from "lucide-react";

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
  disabled,
  editorOptions,
  onCancel,
  onChangeAppSettings,
  onSave
}: {
  readonly appSettings: AppSettingsView;
  readonly disabled: boolean;
  readonly editorOptions: readonly EditorPresetView[];
  readonly onCancel: () => void;
  readonly onChangeAppSettings: (patch: Partial<AppSettingsView>) => void;
  readonly onSave: () => void;
}): React.JSX.Element {
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
        </form>
      </section>
    </div>
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
  label,
  onChange
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label className={styles.settingRow}>
      <span>{label}</span>
      <input
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        type="checkbox"
      />
    </label>
  );
}
