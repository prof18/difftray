/* global React, Icon, WindowChrome, Sidebar, FileList, DiffToolbar, DiffPane, SAMPLE_DIFF, SAMPLE_FILES, HeroLayout, ProjectTabBar, DEFAULT_TABS */
// Difftray — screen compositions

const { useState } = React;

// ───────────────────────── 1. Main diff view (delegates to HeroLayout) ─────────────────────────
function MainDiffScreen({ theme = 'dark', mode = 'split', width = 1280, height = 800, startCollapsed = false, defaultFileListWidth = 340 }) {
  return (
    <HeroLayout
      theme={theme} mode={mode} width={width} height={height}
      startCollapsed={startCollapsed}
      defaultFileListWidth={defaultFileListWidth}
    />
  );
}

// ───────────────────────── 2. Empty state ─────────────────────────
function EmptyStateScreen({ theme = 'dark', width = 1100, height = 720 }) {
  return (
    <WindowChrome theme={theme} title="Difftray" width={width} height={height}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--panel)', padding: 40,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)', marginBottom: 22,
        }}>
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
            <path d="M4 2.5v8M2 5.5h4M12 13.5v-8M10 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{
          fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em',
          color: 'var(--text)', marginBottom: 8,
        }}>No repository open</div>
        <div style={{
          fontSize: 13.5, color: 'var(--text-muted)',
          maxWidth: 420, textAlign: 'center', lineHeight: 1.55, marginBottom: 28,
        }}>
          Open a Git repository to start reviewing local changes. Difftray tracks what you've reviewed and re-flags files when the diff drifts.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button className="dt-btn primary" style={{ height: 32, padding: '0 14px' }}>
            <Icon.Folder />
            Open Repository
            <span className="dt-kbd" style={{
              background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.28)',
              color: 'rgba(255,255,255,0.95)',
            }}>⌘O</span>
          </button>
        </div>
        <div style={{
          display: 'flex', gap: 16, fontSize: 11.5,
          color: 'var(--text-muted)', alignItems: 'center',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Drag a folder anywhere to add it
          </span>
        </div>

        {/* Recent placeholder */}
        <div style={{
          marginTop: 48, width: '100%', maxWidth: 520,
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--panel-2)', padding: 14,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10,
          }}>Recent</div>
          {[
            { name: 'monorepo', path: '~/Code/acme/monorepo' },
            { name: 'inventory-svc', path: '~/Code/acme/inventory-svc' },
            { name: 'difftray', path: '~/Workspace/difftray' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 8px', borderRadius: 6, cursor: 'pointer',
              borderBottom: i < 2 ? '1px solid var(--border-soft)' : 'none',
            }}>
              <Icon.Folder style={{ color: 'var(--text-muted)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{r.name}</div>
                <div className="dt-mono" style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{r.path}</div>
              </div>
              <Icon.Chevron style={{ color: 'var(--text-dim)' }} />
            </div>
          ))}
        </div>
      </div>
    </WindowChrome>
  );
}

// ───────────────────────── 3. Onboarding ─────────────────────────
function OnboardingScreen({ theme = 'dark', width = 880, height = 600 }) {
  return (
    <WindowChrome theme={theme} title="Add Repository" width={width} height={height}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
        {/* Progress */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          fontSize: 11.5, color: 'var(--text-muted)',
        }}>
          <Step n={1} label="Choose folder" done />
          <StepDivider />
          <Step n={2} label="Pick a branch or worktree" active />
          <StepDivider />
          <Step n={3} label="Configure review" />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 6 }}>
            What should Difftray review?
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 540 }}>
            Pick the diff source for <span className="dt-mono" style={{ color: 'var(--text-2)' }}>reader-flow</span>. You can change this anytime from Settings.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 580 }}>
            <OptionCard
              selected
              label="Worktree against base branch"
              hint="Compare uncommitted + committed changes on the current branch against main."
              meta="offline-image → main"
              recommended
            />
            <OptionCard
              label="Working directory only"
              hint="Just uncommitted changes (staged + unstaged)."
              meta="HEAD → working tree"
            />
            <OptionCard
              label="Branch against another branch"
              hint="Pick two refs to diff between."
              meta="choose refs…"
            />
            <OptionCard
              label="Specific commit range"
              hint="Review a range like main..HEAD or a single commit."
              meta="enter range…"
            />
          </div>
        </div>

        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel-2)',
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Settings sync to <span className="dt-mono">.difftray/config.json</span>
          </div>
          <div style={{ flex: 1 }} />
          <button className="dt-btn ghost">Back</button>
          <button className="dt-btn primary">
            Continue
            <span className="dt-kbd" style={{
              background: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.28)',
              color: 'rgba(255,255,255,0.95)',
            }}>↵</span>
          </button>
        </div>
      </div>
    </WindowChrome>
  );
}

function Step({ n, label, done, active }) {
  const color = done ? 'var(--ok)' : active ? 'var(--accent)' : 'var(--text-dim)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 18, height: 18, borderRadius: 50, fontSize: 10.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--ok-soft)' : active ? 'var(--accent-soft)' : 'transparent',
        border: `1px solid ${color}`,
        color,
        fontWeight: 600, fontFamily: 'Geist Mono',
      }}>{done ? '✓' : n}</div>
      <span style={{ color: active ? 'var(--text)' : color, fontWeight: active ? 500 : 400, fontSize: 12 }}>{label}</span>
    </div>
  );
}
function StepDivider() {
  return <div style={{ height: 1, flex: '0 0 28px', background: 'var(--border)' }} />;
}

function OptionCard({ selected, label, hint, meta, recommended }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: 14, borderRadius: 8,
      background: selected ? 'var(--accent-soft)' : 'var(--panel-2)',
      border: `1px solid ${selected ? 'var(--accent-line)' : 'var(--border)'}`,
      cursor: 'pointer', position: 'relative',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: 50, marginTop: 2,
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border-strong)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {selected && <div style={{ width: 7, height: 7, borderRadius: 50, background: 'var(--accent)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
          {recommended && (
            <span className="dt-pill" style={{
              background: 'var(--ok-soft)', color: 'var(--ok)', border: '1px solid var(--ok-soft)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Recommended</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{hint}</div>
        <div className="dt-mono" style={{
          fontSize: 11, color: 'var(--text-dim)', marginTop: 6,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon.Branch />
          {meta}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── 4. Settings ─────────────────────────
function SettingsScreen({ theme = 'dark', width = 900, height = 640 }) {
  const tabs = ['General', 'Repositories', 'Review', 'Diff', 'Keyboard', 'Advanced'];
  return (
    <WindowChrome theme={theme} title="Settings" subtitle="Difftray" width={width} height={height}>
      <div style={{
        width: 200, flexShrink: 0, background: 'var(--bg)',
        borderRight: '1px solid var(--border)', padding: '14px 10px',
      }}>
        {tabs.map((t, i) => (
          <div key={t} style={{
            padding: '7px 10px', borderRadius: 6, marginBottom: 1,
            background: i === 2 ? 'var(--selected)' : 'transparent',
            fontSize: 12.5, color: 'var(--text)', cursor: 'pointer', fontWeight: i === 2 ? 500 : 400,
          }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 4 }}>Review</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 24 }}>
          How Difftray tracks review state and invalidates it.
        </div>

        <SettingGroup label="Re-review triggers">
          <Toggle label="Reset review when diff content changes" hint="Default — content-aware hashes." on />
          <Toggle label="Reset review when line count changes only" hint="Faster, but reviews survive small edits." />
          <Toggle label="Reset review when commit SHA changes" />
        </SettingGroup>

        <SettingGroup label="Defaults">
          <Row label="Default diff mode">
            <Segmented options={['Split', 'Unified']} value="Split" />
          </Row>
          <Row label="Hide whitespace-only changes">
            <Switch on />
          </Row>
          <Row label="Auto-collapse hunks > N lines">
            <Stepper value={120} />
          </Row>
          <Row label="Mark reviewed shortcut">
            <span className="dt-kbd">R</span>
          </Row>
        </SettingGroup>

        <SettingGroup label="Notifications">
          <Row label="Notify when reviewed file drifts">
            <Switch on />
          </Row>
        </SettingGroup>
      </div>
    </WindowChrome>
  );
}

function SettingGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10,
      }}>{label}</div>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 8,
        background: 'var(--panel-2)', overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px', borderBottom: '1px solid var(--border-soft)',
    }}>
      <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, on }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px', borderBottom: '1px solid var(--border-soft)',
    }}>
      <Switch on={on} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
    </div>
  );
}

function Switch({ on }) {
  return (
    <div style={{
      width: 34, height: 20, borderRadius: 10, padding: 2, flexShrink: 0,
      background: on ? 'var(--accent)' : 'var(--border-strong)',
      transition: 'background 0.15s', display: 'flex',
      justifyContent: on ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: 50, background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

function Segmented({ options, value }) {
  return (
    <div style={{
      display: 'flex', padding: 2, gap: 0,
      background: 'var(--bg)', borderRadius: 6,
      border: '1px solid var(--border)',
    }}>
      {options.map(o => (
        <div key={o} style={{
          padding: '4px 12px', borderRadius: 4, fontSize: 12,
          background: value === o ? 'var(--elev)' : 'transparent',
          color: value === o ? 'var(--text)' : 'var(--text-muted)',
          boxShadow: value === o ? 'var(--shadow-sm)' : 'none',
          fontWeight: 500, cursor: 'pointer',
        }}>{o}</div>
      ))}
    </div>
  );
}

function Stepper({ value }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)',
      fontSize: 12, fontFamily: 'Geist Mono',
    }}>
      <button className="dt-icon-btn" style={{ width: 22, height: 22, borderRadius: 0 }}>−</button>
      <span style={{ padding: '0 12px', color: 'var(--text)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', height: 22, display: 'inline-flex', alignItems: 'center' }}>{value}</span>
      <button className="dt-icon-btn" style={{ width: 22, height: 22, borderRadius: 0 }}>+</button>
    </div>
  );
}

// ───────────────────────── 5. Command palette ─────────────────────────
function CommandPaletteScreen({ theme = 'dark', width = 1280, height = 800 }) {
  const items = [
    { kind: 'project', label: 'reader-flow', sub: '~/Workspace/the-reader-app', hint: 'jump to', hot: '↵' },
    { kind: 'project', label: 'difftray', sub: '~/Workspace/projects/difftray', hint: 'jump to' },
    { kind: 'project', label: 'visual-repo', sub: '/private/var/folders/sd/h_zq8', hint: 'jump to' },
    { kind: 'action', label: 'Mark current file reviewed', sub: 'Review', hot: 'R' },
    { kind: 'action', label: 'Flag for attention', sub: 'Review', hot: 'F' },
    { kind: 'action', label: 'Switch to unified diff', sub: 'View' },
    { kind: 'file', label: 'ReaderMode.kt', sub: 'androidApp/src/main/kotlin/…/readermode/ReaderMode.kt' },
    { kind: 'file', label: 'ReaderModeBridge.swift', sub: 'iosApp/Frameworks/Reader/Sources/' },
  ];
  return (
    <HeroLayoutWithOverlay theme={theme} width={width} height={height} mode="split">
      {/* Backdrop over body (preserving titlebar + tab bar) */}
      <div style={{
        position: 'absolute', top: 38 + 38, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.40)', backdropFilter: 'blur(2px)',
        pointerEvents: 'none',
      }} />

      {/* Palette */}
      <div style={{
        position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)',
        width: 580, background: 'var(--panel)',
        border: '1px solid var(--border-strong)', borderRadius: 12,
        boxShadow: 'var(--shadow-pop)', overflow: 'hidden', zIndex: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <Icon.Search style={{ color: 'var(--text-muted)', width: 16, height: 16 }} />
          <div style={{
            flex: 1, fontSize: 15, color: 'var(--text)',
            fontWeight: 400, fontFamily: 'inherit',
          }}>
            read<span style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>er</span>
            <span style={{
              display: 'inline-block', width: 1.5, height: 16, background: 'var(--accent)',
              verticalAlign: 'middle', marginLeft: 1, marginBottom: 2,
            }} />
          </div>
          <span className="dt-pill" style={{
            background: 'var(--bg)', color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}>
            All
          </span>
          <span className="dt-kbd">esc</span>
        </div>

        <div style={{ maxHeight: 440, overflow: 'auto', padding: '6px 0' }}>
          <PaletteGroup label="Projects" />
          <PaletteItem item={items[0]} selected />
          <PaletteItem item={items[1]} />
          <PaletteItem item={items[2]} />
          <PaletteGroup label="Actions" />
          <PaletteItem item={items[3]} />
          <PaletteItem item={items[4]} />
          <PaletteItem item={items[5]} />
          <PaletteGroup label="Files in reader-flow" />
          <PaletteItem item={items[6]} />
          <PaletteItem item={items[7]} />
        </div>

        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--border)',
          background: 'var(--panel-2)', display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="dt-kbd">↑</span><span className="dt-kbd">↓</span>
            <span style={{ marginLeft: 2 }}>navigate</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="dt-kbd">↵</span>
            <span style={{ marginLeft: 2 }}>select</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="dt-kbd">⌘</span><span className="dt-kbd">P</span>
            <span style={{ marginLeft: 2 }}>files only</span>
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="dt-kbd">⌘</span><span className="dt-kbd">K</span>
          </span>
        </div>
      </div>
    </HeroLayoutWithOverlay>
  );
}

function PaletteGroup({ label }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--text-dim)',
      padding: '10px 16px 4px',
    }}>{label}</div>
  );
}

function PaletteItem({ item, selected }) {
  const iconBg = item.kind === 'project' ? 'var(--accent-soft)' : item.kind === 'action' ? 'var(--warn-soft)' : 'var(--ok-soft)';
  const iconColor = item.kind === 'project' ? 'var(--accent)' : item.kind === 'action' ? 'var(--warn)' : 'var(--ok)';
  const ico = item.kind === 'project' ? <Icon.Folder /> : item.kind === 'action' ? <Icon.Check /> : <Icon.File />;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '0 6px',
      padding: '8px 10px', borderRadius: 6,
      background: selected ? 'var(--selected)' : 'transparent',
      borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 5, background: iconBg, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{ico}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{item.label}</div>
        <div className="dt-mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</div>
      </div>
      {item.hint && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.hint}</div>}
      {item.hot && <span className="dt-kbd">{item.hot}</span>}
    </div>
  );
}

// ───────────────────────── 6. Project switcher ─────────────────────────
function ProjectSwitcherScreen({ theme = 'dark', width = 1100, height = 720 }) {
  const projects = [
    { name: 'reader-flow', path: '~/Workspace/the-reader-app', branch: 'offline-image', count: '0/8', stats: { reviewed: 0, attention: 1, pending: 7 }, drifted: true },
    { name: 'difftray', path: '~/Workspace/projects/difftray', branch: 'main', count: '3/3', stats: { reviewed: 3, attention: 0, pending: 0 } },
    { name: 'visual-repo', path: '/private/var/folders/sd/h_zq8', branch: 'lift-render', count: '12/14', stats: { reviewed: 12, attention: 0, pending: 2 } },
    { name: 'kvm-bridge', path: '~/Code/kvm-bridge', branch: 'feat/usb-hid', count: '0/2', stats: { reviewed: 0, attention: 0, pending: 2 } },
    { name: 'inventory-svc', path: '~/Code/acme/inventory-svc', branch: 'release/2026.5', count: '4/12', stats: { reviewed: 4, attention: 2, pending: 6 } },
    { name: 'rust-playground', path: '~/Code/rust-playground', branch: 'main', count: '—', stats: { reviewed: 0, attention: 0, pending: 0 }, clean: true },
  ];
  return (
    <WindowChrome theme={theme} title="Projects" width={width} height={height}>
      <Sidebar width={240} activeProject={null} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
        <div style={{
          padding: '18px 28px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em' }}>All Projects</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              6 watching · 1 needs attention · 1 drifted
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 30, padding: '0 12px', minWidth: 240,
            background: 'var(--bg)', borderRadius: 6,
            border: '1px solid var(--border)',
          }}>
            <Icon.Search style={{ color: 'var(--text-muted)' }} />
            <input
              placeholder="Search projects"
              readOnly
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12.5, fontFamily: 'inherit' }}
            />
          </div>
          <button className="dt-btn primary"><Icon.Plus />Add</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {projects.map((p, i) => <ProjectCard key={i} p={p} />)}
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function ProjectCard({ p }) {
  const total = p.stats.reviewed + p.stats.attention + p.stats.pending;
  return (
    <div style={{
      background: 'var(--panel-2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 14, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'var(--accent-soft)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon.Folder /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{p.name}</span>
            {p.drifted && (
              <span className="dt-pulse" style={{
                width: 6, height: 6, borderRadius: 50, background: 'var(--warn)',
              }} />
            )}
            {p.clean && (
              <span className="dt-pill" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>clean</span>
            )}
          </div>
          <div className="dt-mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{p.path}</div>
        </div>
        <Icon.Chevron style={{ color: 'var(--text-dim)' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--text-muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon.Branch />
          <span className="dt-mono">{p.branch}</span>
        </span>
        <span style={{ color: 'var(--text-dim)' }}>·</span>
        <span className="dt-mono" style={{ color: p.count === '—' ? 'var(--text-dim)' : 'var(--text-2)' }}>{p.count}</span>
      </div>

      {/* mini progress bar */}
      {total > 0 ? (
        <div>
          <div style={{ height: 4, display: 'flex', gap: 1, borderRadius: 2, overflow: 'hidden', background: 'var(--hover)' }}>
            {p.stats.reviewed > 0 && <div style={{ flex: p.stats.reviewed, background: 'var(--ok)' }} />}
            {p.stats.attention > 0 && <div style={{ flex: p.stats.attention, background: 'var(--warn)' }} />}
            {p.stats.pending > 0 && <div style={{ flex: p.stats.pending, background: 'transparent' }} />}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, fontSize: 10.5, fontFamily: 'Geist Mono' }}>
            {p.stats.reviewed > 0 && <span style={{ color: 'var(--ok)' }}>● {p.stats.reviewed}</span>}
            {p.stats.attention > 0 && <span style={{ color: 'var(--warn)' }}>● {p.stats.attention}</span>}
            {p.stats.pending > 0 && <span style={{ color: 'var(--text-dim)' }}>○ {p.stats.pending}</span>}
          </div>
        </div>
      ) : (
        <div style={{ height: 4 }} />
      )}
    </div>
  );
}

// ───────────────────────── 7. Diff drift notification ─────────────────────────
function DriftNotificationScreen({ theme = 'dark', width = 1280, height = 800 }) {
  return (
    <HeroLayoutWithOverlay theme={theme} width={width} height={height} mode="split">
      {/* Toast */}
      <div style={{
        position: 'absolute', bottom: 20, right: 20,
        width: 360, background: 'var(--panel)',
        border: '1px solid var(--border-strong)', borderRadius: 10,
        boxShadow: 'var(--shadow-pop)',
        overflow: 'hidden', zIndex: 10,
      }}>
        <div style={{ height: 3, background: 'var(--warn)' }} />
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: 'var(--warn-soft)', color: 'var(--warn)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon.Warn />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                3 reviewed files drifted
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                The diff changed since you last reviewed them. They're back in your queue.
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <DriftRow name="ReaderMode.kt" diff="+2 −1" />
                <DriftRow name="ReaderModeState.kt" diff="+0 −3" />
                <DriftRow name="WebJsBridge.kt" diff="+12 −0" />
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                <button className="dt-btn" style={{ height: 26, fontSize: 11.5, padding: '0 10px' }}>Review now</button>
                <button className="dt-btn ghost" style={{ height: 26, fontSize: 11.5, padding: '0 10px' }}>Dismiss</button>
              </div>
            </div>
            <button className="dt-icon-btn" style={{ width: 22, height: 22 }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </HeroLayoutWithOverlay>
  );
}

function DriftRow({ name, diff }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
      padding: '4px 8px', borderRadius: 5,
      background: 'var(--warn-soft)',
    }}>
      <span className="dt-pulse" style={{
        width: 5, height: 5, borderRadius: 50, background: 'var(--warn)', flexShrink: 0,
      }} />
      <span className="dt-mono" style={{ color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span className="dt-mono" style={{ color: 'var(--text-muted)' }}>{diff}</span>
    </div>
  );
}

Object.assign(window, {
  MainDiffScreen, EmptyStateScreen, OnboardingScreen, SettingsScreen,
  CommandPaletteScreen, ProjectSwitcherScreen, DriftNotificationScreen,
});
