/* global React */
// Difftray — shared components
// Window chrome, sidebar, file list, diff renderers, icons.

const { useState, useMemo } = React;

// ───────────────────────── Icons ─────────────────────────
const Icon = {
  Folder: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M1.75 4.25c0-.69.56-1.25 1.25-1.25h3.05c.35 0 .68.15.92.4l1.06 1.1h6.22c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25v-8z" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Sidebar: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6.5" y1="3.4" x2="6.5" y2="12.6" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Branch: (p) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="4" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="4" cy="12.5" r="1.6" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="12" cy="6" r="1.6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4 5v6M4 9.5c0-2.5 2-3.5 4-3.5h2" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Search: (p) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Refresh: (p) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M13 8.5a5 5 0 1 1-1.4-3.5M13 3v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Cog: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8 2v1.5M8 12.5V14M14 8h-1.5M3.5 8H2M12.24 3.76l-1.06 1.06M4.82 11.18l-1.06 1.06M12.24 12.24l-1.06-1.06M4.82 4.82L3.76 3.76" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  Check: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Warn: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M8 3v6M8 11.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Skip: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4 4l8 8" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Chevron: (p) => (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Open: (p) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M9 3h4v4M13 3l-6 6M11 9v3.5H3.5V5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Plus: (p) => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Split: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="8" y1="3.4" x2="8" y2="12.6" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  Unified: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="2.5" y1="9.5" x2="13.5" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  File: (p) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M3.5 1.75h6L13 5.25v9c0 .14-.11.25-.25.25H3.5a.25.25 0 0 1-.25-.25v-12.5c0-.14.11-.25.25-.25z" stroke="currentColor" strokeWidth="1.1"/>
      <path d="M9.5 1.75v3.5H13" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  ),
  Diff: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M4 2.5v8M2 5.5h4M12 13.5v-8M10 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  PanelLeft: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6.5" y1="3.4" x2="6.5" y2="12.6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M10.5 6.5L8.5 8l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  PanelRight: (p) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6.5" y1="3.4" x2="6.5" y2="12.6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M8.5 6.5L10.5 8l-2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Dot: (p) => (
    <svg width="4" height="4" viewBox="0 0 4 4" {...p}><circle cx="2" cy="2" r="1.5" fill="currentColor"/></svg>
  ),
};

// ───────────────────────── Window chrome ─────────────────────────
function WindowChrome({ theme = 'dark', title, subtitle, children, width, height }) {
  return (
    <div className={`dt-${theme}`} style={{ width, height }}>
      <div className="dt-window">
        <div className="dt-titlebar">
          <div className="dt-traffic">
            <div className="dot red" />
            <div className="dot yellow" />
            <div className="dot green" />
          </div>
          <div className="dt-title">
            {title}
            {subtitle && <span className="muted"> &nbsp;·&nbsp; {subtitle}</span>}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</div>
      </div>
    </div>
  );
}

// ───────────────────────── Sidebar ─────────────────────────
function Sidebar({ width = 240, activeProject = 'reader-flow', projects, collapsed = false }) {
  const list = projects || [
    { id: 'reader-flow', name: 'reader-flow', path: '~/Workspace/the…', count: '0/8', branch: 'offline-image', stale: false },
    { id: 'difftray',    name: 'difftray',    path: '~/Workspace/projects', count: '3/3', branch: 'main', stale: false, done: true },
    { id: 'visual-repo', name: 'visual-repo', path: '/private/var/folders/sd', count: '12/14', branch: 'lift-render', stale: true },
    { id: 'kvm-bridge',  name: 'kvm-bridge',  path: '~/Code/kvm-bridge', count: '0/2', branch: 'feat/usb-hid', stale: false },
  ];

  return (
    <div style={{
      width, flexShrink: 0, background: 'var(--bg)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 700, fontSize: 12, fontFamily: 'Geist Mono',
          letterSpacing: '-0.02em',
        }}>D</div>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em' }}>Difftray</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button className="dt-icon-btn"><Icon.Sidebar /></button>
        </div>
      </div>

      <div style={{ padding: '4px 10px 12px' }}>
        <button className="dt-btn ghost" style={{
          width: '100%', justifyContent: 'flex-start', height: 30, padding: '0 10px',
          color: 'var(--text-muted)', fontWeight: 500,
        }}>
          <Icon.Search />
          Search projects
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <span className="dt-kbd">⌘</span><span className="dt-kbd">K</span>
          </span>
        </button>
      </div>

      <div style={{ padding: '0 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="dt-section-label">Projects</div>
        <button className="dt-icon-btn" style={{ marginRight: 8, width: 20, height: 20 }}>
          <Icon.Plus />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '2px 8px 8px' }}>
        {list.map((p) => (
          <ProjectRow key={p.id} project={p} active={p.id === activeProject} />
        ))}
      </div>

      <div style={{
        borderTop: '1px solid var(--border)', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11.5, color: 'var(--text-muted)',
      }}>
        <span className="dt-status-dot reviewed" style={{ width: 7, height: 7 }} />
        <span>Watching 4 repos</span>
        <span style={{ marginLeft: 'auto' }} className="dt-mono">v0.4.1</span>
      </div>
    </div>
  );
}

function ProjectRow({ project, active }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 10px', borderRadius: 6,
      background: active ? 'var(--selected)' : 'transparent',
      cursor: 'pointer', marginBottom: 1, position: 'relative',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 500, color: 'var(--text)',
          letterSpacing: '-0.005em',
        }}>
          {project.name}
          {project.stale && (
            <span title="Diff drifted since last review" style={{
              display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--warn)',
            }} className="dt-pulse" />
          )}
        </div>
        <div style={{
          fontSize: 10.5, color: 'var(--text-muted)',
          fontFamily: 'Geist Mono', marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {project.path}
        </div>
      </div>
      <div style={{
        fontFamily: 'Geist Mono', fontSize: 10.5,
        color: project.done ? 'var(--ok)' : 'var(--text-muted)',
        fontWeight: 500,
      }}>{project.count}</div>
    </div>
  );
}

// ───────────────────────── File list panel ─────────────────────────
const SAMPLE_FILES = [
  { path: 'androidApp/src/main/kotlin/com/prof18/readerflow/android/readermode/ReaderMode.kt', status: 'attention', plus: 23, minus: 7, drifted: true, selected: true },
  { path: 'iosApp/Frameworks/Reader/Sources/ReaderModeBridge.swift', status: 'pending', plus: 29, minus: 0, drifted: false },
  { path: 'shared/src/commonMain/kotlin/com/prof18/readerflow/state/ReaderModeState.kt', status: 'reviewed', plus: 1, minus: 0, drifted: false },
  { path: 'shared/src/commonMain/kotlin/com/prof18/readerflow/web/WebJsBridge.kt', status: 'pending', plus: 86, minus: 26, drifted: false },
  { path: 'shared/src/commonTest/kotlin/com/prof18/readerflow/ReaderModeStateTest.kt', status: 'pending', plus: 81, minus: 0, drifted: false },
  { path: '.ai/offline-reader-images-review-checklist.md', status: 'reviewed', plus: 164, minus: 0, drifted: false },
  { path: '.scripts/clear-android-webview-cache.sh', status: 'reviewed', plus: 109, minus: 0, drifted: false },
  { path: '.scripts/clear-ios-webview-cache.sh', status: 'pending', plus: 105, minus: 0, drifted: false },
];

function FileList({ width = 360, files = SAMPLE_FILES, branch = 'offline-image', onToggleCollapse }) {
  const reviewed = files.filter(f => f.status === 'reviewed').length;
  const attention = files.filter(f => f.status === 'attention').length;
  const pending = files.length - reviewed - attention;
  const total = files.length;

  return (
    <div style={{
      width, flexShrink: 0, background: 'transparent',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border-soft)', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 12,
            fontSize: 12.5,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
              <span className="dt-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>changed</span>
            </span>
            {attention > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--warn)', fontWeight: 500 }}>
                <span className="dt-pulse" style={{
                  width: 6, height: 6, borderRadius: 50, background: 'var(--warn)',
                }} />
                <span className="dt-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>{attention}</span>
                <span>need attention</span>
              </span>
            )}
          </div>
          <button className="dt-icon-btn" title="Refresh"><Icon.Refresh /></button>
          {onToggleCollapse && (
            <button className="dt-icon-btn" title="Hide files (⌘1)" onClick={onToggleCollapse}>
              <Icon.PanelLeft />
            </button>
          )}
        </div>
        {/* progress bar */}
        <div style={{
          marginTop: 10, height: 4, borderRadius: 2,
          background: 'var(--hover)', display: 'flex', overflow: 'hidden', gap: 1,
        }}>
          {reviewed > 0 && <div style={{ flex: reviewed, background: 'var(--ok)' }} />}
          {attention > 0 && <div style={{ flex: attention, background: 'var(--warn)' }} />}
          {pending > 0 && <div style={{ flex: pending, background: 'transparent' }} />}
        </div>
      </div>

      {/* filter */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 28, padding: '0 10px',
          background: 'var(--bg)', borderRadius: 6,
          border: '1px solid var(--border)',
        }}>
          <Icon.Search style={{ color: 'var(--text-muted)' }} />
          <input
            placeholder="Filter files"
            readOnly
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
            }}
          />
          <span className="dt-kbd">/</span>
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {files.map((f, i) => <FileRow key={i} file={f} />)}
      </div>

      {/* footer hints */}
      <div style={{
        borderTop: '1px solid var(--border-soft)', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 10.5, color: 'var(--text-muted)',
      }}>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <span className="dt-kbd">J</span><span className="dt-kbd">K</span>
          <span style={{ marginLeft: 2 }}>navigate</span>
        </span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <span className="dt-kbd">R</span>
          <span style={{ marginLeft: 2 }}>review</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <span className="dt-kbd">?</span>
        </span>
      </div>
    </div>
  );
}

function FileRow({ file }) {
  const parts = file.path.split('/');
  const filename = parts.pop();
  const dir = parts.join('/');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 12px 6px 10px', margin: '0 6px', borderRadius: 6,
      background: file.selected ? 'var(--selected)' : 'transparent',
      borderLeft: file.selected ? '2px solid var(--accent)' : '2px solid transparent',
      cursor: 'pointer',
      position: 'relative',
    }}>
      <span className={`dt-status-dot ${file.status}`} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0,
        }}>
          <span style={{
            fontFamily: 'Geist Mono', fontSize: 11.5, fontWeight: 500,
            color: 'var(--text)', whiteSpace: 'nowrap',
          }}>{filename}</span>
          {file.drifted && (
            <span title="Diff changed since last review" className="dt-pulse" style={{
              display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
              background: 'var(--warn)', marginLeft: 2, flexShrink: 0,
            }} />
          )}
        </div>
        <div style={{
          fontFamily: 'Geist Mono', fontSize: 10, color: 'var(--text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginTop: 1,
        }}>{dir}</div>
      </div>
      <DiffStat plus={file.plus} minus={file.minus} />
    </div>
  );
}

function DiffStat({ plus, minus }) {
  const total = plus + minus;
  const ratio = total > 0 ? plus / total : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Geist Mono', fontSize: 10.5 }}>
      <span style={{ color: 'var(--add-mark)', fontWeight: 600 }}>+{plus}</span>
      <span style={{ color: minus > 0 ? 'var(--del-mark)' : 'var(--text-dim)', fontWeight: 600 }}>−{minus}</span>
      <div style={{ display: 'flex', gap: 1.5 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            width: 3, height: 8, borderRadius: 1,
            background: i < Math.round(ratio * 5)
              ? 'var(--add-mark)'
              : (i < 5 && minus > 0)
                ? 'var(--del-mark)'
                : 'var(--border)',
            opacity: total === 0 ? 0.3 : 1,
          }} />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── Diff pane ─────────────────────────
// Sample diff content modeled after the screenshot
const SAMPLE_DIFF = {
  path: 'androidApp/src/main/kotlin/com/prof18/readerflow/android/readermode/ReaderMode.kt',
  hunks: [
    {
      header: '@@ -370,7 +370,23 @@ fun ReaderMode(',
      lines: [
        { type: 'ctx',  old: 370, neu: 370, text: '    val webViewState = rememberWebViewStateWithHTMLData(' },
        { type: 'ctx',  old: 371, neu: 371, text: '        data = content,' },
        { type: 'ctx',  old: 372, neu: 372, text: '        baseUrl = readerModeState.readerModeData.localBaseUrl,' },
        { type: 'ctx',  old: 373, neu: 373, text: '    )' },
        { type: 'ctx',  old: 374, neu: 374, text: '' },
        { type: 'add',  old: null, neu: 375, text: '    // The reader loads HTML via loadDataWithBaseURL from the offline' },
        { type: 'add',  old: null, neu: 376, text: '    // package directory; the page references images by file:// paths.' },
        { type: 'add',  old: null, neu: 377, text: '    // loadDataWithBaseURL gives that document an http:// origin, so the' },
        { type: 'add',  old: null, neu: 378, text: '    // file:// fetches are blocked unless these flags are enabled. The' },
        { type: 'add',  old: null, neu: 379, text: '    // WebSettings from WebViewState aren\u2019t applied after onCreated, so' },
        { type: 'add',  old: null, neu: 380, text: '    // we mirror them on the live webView instance below.' },
        { type: 'add',  old: null, neu: 381, text: '    state.webSettings.apply {' },
        { type: 'add',  old: null, neu: 382, text: '        allowFileAccessFromFileURLs = true' },
        { type: 'add',  old: null, neu: 383, text: '        allowUniversalAccessFromFileURLs = true' },
        { type: 'add',  old: null, neu: 384, text: '        androidWebSettings.allowFileAccess = true' },
        { type: 'add',  old: null, neu: 385, text: '    }' },
        { type: 'ctx',  old: 375, neu: 386, text: '' },
        { type: 'ctx',  old: 376, neu: 387, text: '    val jsBridge = rememberWebViewJsBridge()' },
        { type: 'ctx',  old: 377, neu: 388, text: '' },
        { type: 'ctx',  old: 378, neu: 389, text: '    LaunchedEffect(jsBridge) {' },
      ],
    },
    {
      header: '@@ -432,6 +445,11 @@ fun ReaderMode(',
      lines: [
        { type: 'ctx',  old: 432, neu: 445, text: '            onCreated = { webView ->' },
        { type: 'del',  old: 433, neu: null, text: '                // Use cached resources when they are available, even if they have expired.' },
        { type: 'del',  old: 434, neu: null, text: '                // Otherwise, load resources from the network.' },
        { type: 'add',  old: null, neu: 446, text: '                // Use cached resources when they are available, even if expired —' },
        { type: 'add',  old: null, neu: 447, text: '                // this is what makes images render offline without a network round-trip.' },
        { type: 'add',  old: null, neu: 448, text: '                // We use it for trying to load the images without network.' },
        { type: 'ctx',  old: 435, neu: 449, text: '                webView.settings.cacheMode = android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK' },
        { type: 'ctx',  old: 436, neu: 450, text: '            },' },
        { type: 'ctx',  old: 437, neu: 451, text: '            )' },
      ],
    },
  ],
};

// Subtle syntax — match Kotlin keywords / strings / numbers / comments
const KW = /\b(fun|val|var|true|false|null|if|else|return|class|object|when|is|as|in|by|companion|private|public|internal|protected|override|suspend|sealed|data|enum|interface|import|package|this|it)\b/;
function syntaxify(text) {
  // Returns array of spans
  const out = [];
  let rest = text;
  let key = 0;
  // Detect leading whitespace
  const lead = rest.match(/^\s*/)[0];
  if (lead) { out.push(<span key={`w${key++}`}>{lead}</span>); rest = rest.slice(lead.length); }
  // Comment
  if (rest.trimStart().startsWith('//')) {
    out.push(<span key={`c${key++}`} style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>{rest}</span>);
    return out;
  }
  // Tokenize on word/string/number
  const re = /("[^"]*"|'[^']*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[^A-Za-z0-9_"']+)/g;
  let m;
  while ((m = re.exec(rest))) {
    const tok = m[0];
    if (tok.startsWith('"') || tok.startsWith("'")) {
      out.push(<span key={`s${key++}`} style={{ color: 'var(--ok)' }}>{tok}</span>);
    } else if (/^\d/.test(tok)) {
      out.push(<span key={`n${key++}`} style={{ color: 'var(--warn)' }}>{tok}</span>);
    } else if (KW.test(tok)) {
      out.push(<span key={`k${key++}`} style={{ color: 'var(--accent)' }}>{tok}</span>);
    } else if (/^[A-Z]/.test(tok)) {
      out.push(<span key={`t${key++}`} style={{ color: 'var(--text)' }}>{tok}</span>);
    } else {
      out.push(<span key={`x${key++}`} style={{ color: 'var(--text-2)' }}>{tok}</span>);
    }
  }
  return out;
}

function DiffToolbar({ mode = 'split', onMode, file = SAMPLE_DIFF, status = 'attention' }) {
  const parts = file.path.split('/');
  const filename = parts.pop();
  const dir = parts.join('/');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg)',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`dt-status-dot ${status}`} style={{ width: 9, height: 9 }} />
          <span className="dt-mono" style={{
            fontSize: 12.5, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{dir}/</span>
          <span className="dt-mono" style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 600 }}>
            {filename}
          </span>
          {status === 'attention' && (
            <span className="dt-pill" style={{
              background: 'var(--warn-soft)', color: 'var(--warn)',
              border: '1px solid var(--warn-soft)',
            }}>
              <Icon.Warn />
              Diff changed
            </span>
          )}
        </div>
        <div style={{
          marginTop: 3, fontSize: 11, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icon.Branch style={{ color: 'var(--text-dim)' }} />
            <span className="dt-mono">offline-image</span>
          </span>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <span className="dt-mono"><span style={{ color: 'var(--add-mark)' }}>+23</span> <span style={{ color: 'var(--del-mark)' }}>−7</span></span>
          <span style={{ color: 'var(--text-dim)' }}>·</span>
          <span>modified 2 hunks</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* View mode segmented */}
        <div style={{
          display: 'flex', background: 'var(--bg)', borderRadius: 6,
          padding: 2, border: '1px solid var(--border)',
        }}>
          <button
            className="dt-icon-btn"
            onClick={() => onMode && onMode('unified')}
            style={{
              width: 28, height: 22, borderRadius: 4,
              background: mode === 'unified' ? 'var(--elev)' : 'transparent',
              boxShadow: mode === 'unified' ? 'var(--shadow-sm)' : 'none',
              color: mode === 'unified' ? 'var(--text)' : 'var(--text-muted)',
            }}
            title="Unified"
          ><Icon.Unified /></button>
          <button
            className="dt-icon-btn"
            onClick={() => onMode && onMode('split')}
            style={{
              width: 28, height: 22, borderRadius: 4,
              background: mode === 'split' ? 'var(--elev)' : 'transparent',
              boxShadow: mode === 'split' ? 'var(--shadow-sm)' : 'none',
              color: mode === 'split' ? 'var(--text)' : 'var(--text-muted)',
            }}
            title="Split"
          ><Icon.Split /></button>
        </div>
        <button className="dt-icon-btn" title="Open in editor"><Icon.Open /></button>
        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
        <button className="dt-btn primary">
          <Icon.Check />
          Mark reviewed
          <span className="dt-kbd" style={{
            background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.28)',
            color: 'rgba(255,255,255,0.95)',
          }}>R</span>
        </button>
      </div>
    </div>
  );
}

function DiffPane({ mode = 'split', file = SAMPLE_DIFF }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: 'var(--panel)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Geist Mono', fontSize: 12, lineHeight: '20px',
    }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {file.hunks.map((h, i) => (
          <Hunk key={i} hunk={h} mode={mode} />
        ))}
      </div>
    </div>
  );
}

function Hunk({ hunk, mode }) {
  return (
    <div>
      <div style={{
        padding: '6px 14px', background: 'var(--panel-2)',
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        color: 'var(--text-muted)', fontSize: 11.5,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon.Diff style={{ color: 'var(--text-dim)' }} />
        <span className="dt-mono">{hunk.header}</span>
      </div>
      {mode === 'split' ? <SplitHunk hunk={hunk} /> : <UnifiedHunk hunk={hunk} />}
    </div>
  );
}

function UnifiedHunk({ hunk }) {
  return (
    <div>
      {hunk.lines.map((l, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '44px 44px 1fr', alignItems: 'center',
          background: l.type === 'add' ? 'var(--add-bg)' : l.type === 'del' ? 'var(--del-bg)' : 'transparent',
          borderLeft: `2px solid ${l.type === 'add' ? 'var(--add-mark)' : l.type === 'del' ? 'var(--del-mark)' : 'transparent'}`,
          minHeight: 20,
        }}>
          <LineNumber n={l.old} type={l.type === 'add' ? 'empty' : 'normal'} />
          <LineNumber n={l.neu} type={l.type === 'del' ? 'empty' : 'normal'} />
          <div style={{
            padding: '0 10px', whiteSpace: 'pre',
            color: l.type === 'ctx' ? 'var(--text-2)' : 'var(--text)',
          }}>
            <span style={{
              color: l.type === 'add' ? 'var(--add-mark)' : l.type === 'del' ? 'var(--del-mark)' : 'var(--text-dim)',
              display: 'inline-block', width: 14,
            }}>{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
            {syntaxify(l.text)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SplitHunk({ hunk }) {
  // Build paired rows
  const rows = [];
  let i = 0;
  while (i < hunk.lines.length) {
    const ln = hunk.lines[i];
    if (ln.type === 'ctx') {
      rows.push({ left: ln, right: ln });
      i++;
    } else if (ln.type === 'del') {
      // collect run of dels then adds
      const dels = [];
      const adds = [];
      while (i < hunk.lines.length && hunk.lines[i].type === 'del') { dels.push(hunk.lines[i++]); }
      while (i < hunk.lines.length && hunk.lines[i].type === 'add') { adds.push(hunk.lines[i++]); }
      const len = Math.max(dels.length, adds.length);
      for (let k = 0; k < len; k++) {
        rows.push({ left: dels[k] || null, right: adds[k] || null });
      }
    } else if (ln.type === 'add') {
      const adds = [];
      while (i < hunk.lines.length && hunk.lines[i].type === 'add') { adds.push(hunk.lines[i++]); }
      for (const a of adds) rows.push({ left: null, right: a });
    } else { i++; }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border-soft)' }}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          <SplitCell line={r.left} side="left" />
          <SplitCell line={r.right} side="right" />
        </React.Fragment>
      ))}
    </div>
  );
}

function SplitCell({ line, side }) {
  if (!line) {
    return <div style={{ background: 'var(--panel-2)', borderRight: side === 'left' ? '1px solid var(--border)' : 'none', minHeight: 20 }} />;
  }
  const isAdd = line.type === 'add';
  const isDel = line.type === 'del';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '44px 1fr', alignItems: 'center',
      background: isAdd ? 'var(--add-bg)' : isDel ? 'var(--del-bg)' : 'transparent',
      borderLeft: `2px solid ${isAdd && side === 'right' ? 'var(--add-mark)' : isDel && side === 'left' ? 'var(--del-mark)' : 'transparent'}`,
      borderRight: side === 'left' ? '1px solid var(--border)' : 'none',
      minHeight: 20,
    }}>
      <LineNumber n={side === 'left' ? line.old : line.neu} type={isAdd && side === 'left' ? 'empty' : isDel && side === 'right' ? 'empty' : 'normal'} />
      <div style={{
        padding: '0 10px', whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis',
        color: line.type === 'ctx' ? 'var(--text-2)' : 'var(--text)',
      }}>
        {syntaxify(line.text)}
      </div>
    </div>
  );
}

function LineNumber({ n, type }) {
  return (
    <div style={{
      textAlign: 'right', padding: '0 8px',
      fontSize: 11, color: 'var(--text-dim)',
      userSelect: 'none', fontVariantNumeric: 'tabular-nums',
    }}>
      {type === 'empty' ? '' : (n ?? '')}
    </div>
  );
}

// Expose for other Babel files
Object.assign(window, {
  Icon, WindowChrome, Sidebar, FileList, FileRow, DiffStat,
  DiffToolbar, DiffPane, SAMPLE_DIFF, SAMPLE_FILES,
});
