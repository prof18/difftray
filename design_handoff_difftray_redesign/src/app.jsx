/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard,
   MainDiffScreen, EmptyStateScreen, OnboardingScreen, SettingsScreen,
   CommandPaletteScreen, DriftNotificationScreen,
   HeroLayout */

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="hero"
        title="Main diff view"
        subtitle="Top tabs · resizable file list · light + dark. Drag the right edge of the file list to resize, or hit the panel-hide button in its header to collapse it down to a 32px progress rail."
      >
        <DCArtboard id="diff-dark"  label="Diff · Dark · file list 340px"  width={1280} height={800}>
          <MainDiffScreen theme="dark"  mode="split" />
        </DCArtboard>
        <DCArtboard id="diff-light" label="Diff · Light · file list 340px" width={1280} height={800}>
          <MainDiffScreen theme="light" mode="split" />
        </DCArtboard>
        <DCArtboard id="diff-dark-collapsed"  label="Diff · Dark · file list collapsed (~1216px diff)"  width={1280} height={800}>
          <MainDiffScreen theme="dark"  mode="split" startCollapsed />
        </DCArtboard>
        <DCArtboard id="diff-light-collapsed" label="Diff · Light · file list collapsed"               width={1280} height={800}>
          <MainDiffScreen theme="light" mode="split" startCollapsed />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="diff-modes"
        title="Unified mode"
        subtitle="Same chrome, single-column diff."
      >
        <DCArtboard id="unified-dark"  label="Unified · Dark"  width={1280} height={800}>
          <MainDiffScreen theme="dark"  mode="unified" />
        </DCArtboard>
        <DCArtboard id="unified-light" label="Unified · Light" width={1280} height={800}>
          <MainDiffScreen theme="light" mode="unified" />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="overlays"
        title="Command palette"
        subtitle="⌘K palette for project + file + action search."
      >
        <DCArtboard id="cmdk-dark"      label="Command palette · Dark"  width={1280} height={800}>
          <CommandPaletteScreen theme="dark" />
        </DCArtboard>
        <DCArtboard id="cmdk-light"     label="Command palette · Light" width={1280} height={800}>
          <CommandPaletteScreen theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="drift"
        title="Diff-drift notification"
        subtitle="When previously-reviewed files change, review state is reset and a toast appears."
      >
        <DCArtboard id="drift-dark"  label="Drift toast · Dark"  width={1280} height={800}>
          <DriftNotificationScreen theme="dark" />
        </DCArtboard>
        <DCArtboard id="drift-light" label="Drift toast · Light" width={1280} height={800}>
          <DriftNotificationScreen theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="states"
        title="Empty"
        subtitle="No-repo state."
      >
        <DCArtboard id="empty-dark"    label="Empty · Dark"      width={1100} height={720}>
          <EmptyStateScreen theme="dark" />
        </DCArtboard>
        <DCArtboard id="empty-light"   label="Empty · Light"     width={1100} height={720}>
          <EmptyStateScreen theme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection
        id="settings"
        title="Settings"
        subtitle="Review tab — where the 3-state model and drift triggers are configured."
      >
        <DCArtboard id="settings-dark"  label="Settings · Dark"  width={900} height={640}>
          <SettingsScreen theme="dark" />
        </DCArtboard>
        <DCArtboard id="settings-light" label="Settings · Light" width={900} height={640}>
          <SettingsScreen theme="light" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
