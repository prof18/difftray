import { processFile } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useMemo, useState } from "react";
import type { DiffSurfacePreview, DiffSurfaceThemeTokens } from "./surface-bridge.js";
import { createSurfaceFileDiffOptions } from "./surface-pierre-renderer.js";
import { diffSurfaceStyle } from "./surface-style.js";

export function previewSegments(text: string, lineStart: number, expanded: boolean) {
  const lines = text.split("\n");
  if (lines.length <= 6 || expanded) return [{ lines, lineStart }];
  return [
    { lines: lines.slice(0, 3), lineStart },
    { lines: lines.slice(-2), lineStart: lineStart + lines.length - 2 }
  ];
}

export function SurfacePreview({
  preview,
  theme
}: {
  readonly preview: DiffSurfacePreview;
  readonly theme: DiffSurfaceThemeTokens;
}) {
  const [expanded, setExpanded] = useState(false);
  const segments = useMemo(
    () => previewSegments(preview.text, preview.lineStart, expanded),
    [preview, expanded]
  );
  const hiddenCount = preview.text.split("\n").length - 5;
  return (
    <main
      className="diff-surface-frame diff-surface__preview"
      style={diffSurfaceStyle(theme)}
    >
      {segments.map((segment, index) => (
        <section key={segment.lineStart}>
          {index === 1 ? (
            <button
              className="diff-surface__preview-expand"
              onClick={() => setExpanded(true)}
              type="button"
            >
              Show {hiddenCount} more lines
            </button>
          ) : null}
          <PreviewCode {...segment} path={preview.path} theme={theme} />
        </section>
      ))}
      {expanded && hiddenCount > 1 ? (
        <button
          className="diff-surface__preview-expand"
          onClick={() => setExpanded(false)}
          type="button"
        >
          Collapse lines
        </button>
      ) : null}
    </main>
  );
}

function PreviewCode({
  lines,
  lineStart,
  path,
  theme
}: {
  readonly lines: string[];
  readonly lineStart: number;
  readonly path: string;
  readonly theme: DiffSurfaceThemeTokens;
}) {
  const fileDiff = useMemo(() => {
    // A neutral context patch preserves the original gutter numbers without
    // inventing additions/deletions or padding the source with empty lines.
    const patch = `--- preview\n+++ preview\n@@ -${String(lineStart)},${String(lines.length)} +${String(lineStart)},${String(lines.length)} @@\n${lines.map((line) => ` ${line}`).join("\n")}\n`;
    const result = processFile(patch, { throwOnError: true });
    return result ? { ...result, name: path } : undefined;
  }, [lines, lineStart, path]);
  const options = useMemo(() => {
    const shared = createSurfaceFileDiffOptions({
      diffMode: "unified",
      resolvedTheme: theme.scheme,
      wrapLines: true
    });
    return {
      ...shared,
      enableLineSelection: false,
      lineHoverHighlight: "disabled" as const,
      diffIndicators: "none" as const,
      unsafeCSS: `${shared.unsafeCSS ?? ""}\n[data-hunk-separator], [data-separator] { display: none; }`
    };
  }, [theme.scheme]);
  return fileDiff ? (
    <FileDiff disableWorkerPool fileDiff={fileDiff} options={options} />
  ) : null;
}
