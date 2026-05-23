import {
  CheckCircle2,
  ChevronRight,
  Circle,
  FolderOpen,
  GitBranch,
  RefreshCw,
  Search
} from "lucide-react";

import styles from "./App.module.css";

const projects = [
  { name: "difftray", mode: "working tree", progress: "0/0", status: "clean" },
  { name: "reader-flow", mode: "branch", progress: "12/18", status: "open" }
] as const;

const files = [
  { path: "packages/core/src/review-target.ts", state: "pending", lines: "+84 -0" },
  { path: "packages/git/src/status-parser.ts", state: "pending", lines: "+41 -6" },
  { path: "docs/decisions/0013-review-targets.md", state: "reviewed", lines: "+32 -0" }
] as const;

export function App(): React.JSX.Element {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Projects">
        <div className={styles.brandRow}>
          <div className={styles.brandMark}>D</div>
          <div>
            <div className={styles.brandName}>Difftray</div>
            <div className={styles.brandSubtle}>local review desk</div>
          </div>
        </div>

        <button className={styles.openButton} type="button">
          <FolderOpen size={16} aria-hidden />
          Open Repository
        </button>

        <div className={styles.projectList}>
          {projects.map((project) => (
            <button className={styles.projectItem} type="button" key={project.name}>
              <span className={styles.projectGlyph} />
              <span className={styles.projectCopy}>
                <span className={styles.projectName}>{project.name}</span>
                <span className={styles.projectMeta}>
                  {project.mode} · {project.progress}
                </span>
              </span>
              <span className={styles.projectStatus}>{project.status}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className={styles.workspace} aria-label="Review workspace">
        <header className={styles.toolbar}>
          <div className={styles.targetBlock}>
            <div className={styles.targetTitle}>difftray</div>
            <div className={styles.targetMeta}>
              <GitBranch size={14} aria-hidden />
              main · working tree
            </div>
          </div>

          <div className={styles.toolbarActions}>
            <label className={styles.searchBox}>
              <Search size={15} aria-hidden />
              <input type="search" placeholder="Filter files" />
            </label>
            <button
              className={styles.iconButton}
              type="button"
              aria-label="Refresh project"
            >
              <RefreshCw size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div className={styles.reviewGrid}>
          <nav className={styles.filePane} aria-label="Changed files">
            <div className={styles.filePaneHeader}>
              <span>Changed files</span>
              <span className={styles.progressPill}>1 reviewed</span>
            </div>

            <div className={styles.fileList}>
              {files.map((file) => (
                <button className={styles.fileItem} type="button" key={file.path}>
                  {file.state === "reviewed" ? (
                    <CheckCircle2 className={styles.reviewedIcon} size={17} aria-hidden />
                  ) : (
                    <Circle className={styles.pendingIcon} size={17} aria-hidden />
                  )}
                  <span className={styles.fileCopy}>
                    <span className={styles.filePath}>{file.path}</span>
                    <span className={styles.fileMeta}>{file.lines}</span>
                  </span>
                  <ChevronRight size={15} aria-hidden />
                </button>
              ))}
            </div>
          </nav>

          <article className={styles.diffPane} aria-label="Diff preview">
            <div className={styles.diffHeader}>
              <span>packages/core/src/review-target.ts</span>
              <span className={styles.diffBadge}>pending review</span>
            </div>
            <div className={styles.diffSurface}>
              <pre>{`+ export type ReviewTarget = {
+   readonly kind: "working-tree" | "branch";
+   readonly repositoryRoot: string;
+   readonly baseSha: string;
+   readonly headSha: string;
+ };`}</pre>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
