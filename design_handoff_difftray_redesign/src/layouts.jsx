/* global React, Icon, WindowChrome, FileList, DiffToolbar, DiffPane, SAMPLE_FILES */
// Difftray — primary layout (chosen direction: top tabs)
// File list is resizable (220–540px) and collapsible. When collapsed, a
// 32px rail on the left edge with the expand toggle remains visible.

const { useState: useStateL, useEffect: useEffectL, useRef: useRefL } = React;

// ───────────────────────── Project tab bar ─────────────────────────
function ProjectTabBar({ tabs }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      padding: '0 8px', height: 38, flexShrink: 0, gap: 1,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 5, marginRight: 10,
        background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
        color: 'white', fontFamily: 'Geist Mono', fontWeight: 700, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>D</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {tabs.map(t => <ProjectTab key={t.id} tab={t} />)}
        <button className="dt-icon-btn" style={{ marginLeft: 4 }} title="Add project">
          <Icon.Plus />
        </button>
      </div>
      <button className="dt-icon-btn" title="Settings"><Icon.Cog /></button>
    </div>
  );
}

function ProjectTab({ tab }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '0 12px', height: 28,
      borderRadius: 6,
      background: tab.active ? 'var(--panel)' : 'transparent',
      border: tab.active ? '1px solid var(--border)' : '1px solid transparent',
      borderBottom: tab.active ? '1px solid var(--panel)' : '1px solid transparent',
      marginBottom: tab.active ? -1 : 0,
      cursor: 'pointer',
      fontSize: 12.5, color: tab.active ? 'var(--text)' : 'var(--text-muted)',
      fontWeight: tab.active ? 500 : 400,
      whiteSpace: 'nowrap',
    }}>
      <Icon.Folder style={{ color: tab.active ? 'var(--accent)' : 'var(--text-dim)' }} />
      <span>{tab.name}</span>
      {tab.stale && (
        <span className="dt-pulse" style={{
          width: 5, height: 5, borderRadius: 50, background: 'var(--warn)',
        }} />
      )}
      <span className="dt-mono" style={{
        fontSize: 10.5,
        color: tab.done ? 'var(--ok)' : tab.attn ? 'var(--warn)' : 'var(--text-dim)',
        marginLeft: 2,
      }}>{tab.count}</span>
    </div>
  );
}

const DEFAULT_TABS = [
  { id: 'reader-flow', name: 'reader-flow', count: '0/8',  active: true,  stale: true },
  { id: 'difftray',    name: 'difftray',    count: '3/3',  active: false, done: true },
  { id: 'visual-repo', name: 'visual-repo', count: '12/14', active: false, attn: 2 },
  { id: 'kvm-bridge',  name: 'kvm-bridge',  count: '0/2',  active: false },
];

// ───────────────────────── Resize handle ─────────────────────────
function ResizeHandle({ onDown }) {
  const [hover, setHover] = useStateL(false);
  return (
    <div
      onMouseDown={onDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 5, marginLeft: -2, marginRight: -3, zIndex: 5,
        cursor: 'col-resize', position: 'relative',
        background: hover ? 'var(--accent)' : 'transparent',
        transition: 'background 0.12s 0.05s',
        flexShrink: 0,
      }}
    >
      {/* invisible expand for easier grab */}
      <div style={{ position: 'absolute', inset: '0 -3px' }} />
    </div>
  );
}

// ───────────────────────── Collapsed rail ─────────────────────────
function CollapsedRail({ onExpand, attention = 1, pending = 6 }) {
  return (
    <div style={{
      width: 32, flexShrink: 0, background: 'var(--panel-2)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 0', gap: 8,
    }}>
      <button
        className="dt-icon-btn"
        onClick={onExpand}
        title="Show files (⌘1)"
        style={{ width: 26, height: 26 }}
      >
        <Icon.PanelRight />
      </button>
      <div style={{ width: 16, height: 1, background: 'var(--border)' }} />
      {/* Vertical progress beads */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 4 }} title="pending · attention">
        <span className="dt-status-dot reviewed" style={{ width: 7, height: 7, boxShadow: 'none' }} />
        <span className="dt-status-dot attention" style={{ width: 7, height: 7, boxShadow: 'none' }} />
        <span className="dt-status-dot pending" style={{ width: 7, height: 7 }} />
        <span className="dt-status-dot pending" style={{ width: 7, height: 7 }} />
        <span className="dt-status-dot pending" style={{ width: 7, height: 7 }} />
        <span className="dt-status-dot pending" style={{ width: 7, height: 7 }} />
        <span className="dt-status-dot pending" style={{ width: 7, height: 7 }} />
        <span className="dt-status-dot pending" style={{ width: 7, height: 7 }} />
      </div>
      <div style={{ flex: 1 }} />
      <div className="dt-mono" style={{
        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em',
      }}>1 / 8 reviewed</div>
    </div>
  );
}

// ───────────────────────── Hero layout (top tabs + resizable file list) ─────────────────────────
function HeroLayout({
  theme = 'dark', width = 1280, height = 800,
  mode = 'split',
  defaultFileListWidth = 340,
  startCollapsed = false,
  tabs = DEFAULT_TABS,
}) {
  const [fileListWidth, setFileListWidth] = useStateL(defaultFileListWidth);
  const [collapsed, setCollapsed] = useStateL(startCollapsed);
  const [dragging, setDragging] = useStateL(false);
  const startXRef = useRefL(0);
  const startWRef = useRefL(0);

  useEffectL(() => {
    if (!dragging) return;
    function onMove(e) {
      const dx = e.clientX - startXRef.current;
      const newW = Math.max(220, Math.min(540, startWRef.current + dx));
      setFileListWidth(newW);
    }
    function onUp() {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  function onResizeStart(e) {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWRef.current = fileListWidth;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <WindowChrome theme={theme} title="Difftray" width={width} height={height}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ProjectTabBar tabs={tabs} />

        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          {collapsed ? (
            <CollapsedRail onExpand={() => setCollapsed(false)} />
          ) : (
            <>
              <FileList width={fileListWidth} onToggleCollapse={() => setCollapsed(true)} />
              <ResizeHandle onDown={onResizeStart} />
            </>
          )}

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <DiffToolbar mode={mode} />
            <DiffPane mode={mode} />
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

// ───────────────────────── Variants with overlays — for screens that need
// to compose the hero chrome with a popover / toast ─────────────────────────

function HeroLayoutWithOverlay({ children, theme = 'dark', ...heroProps }) {
  return (
    <div className={`dt-${theme}`} style={{ position: 'relative', width: heroProps.width, height: heroProps.height }}>
      <HeroLayout theme={theme} {...heroProps} />
      {children}
    </div>
  );
}

Object.assign(window, {
  HeroLayout, HeroLayoutWithOverlay, ProjectTabBar, ProjectTab,
  CollapsedRail, ResizeHandle, DEFAULT_TABS,
  // back-compat aliases (canvas references)
  IconRailLayout: HeroLayout, // unused after refactor
  TopTabsLayout: HeroLayout,
  MinimalLayout: HeroLayout,
});
