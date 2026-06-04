import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoadingProgress, TabLoadBanner } from "./workspace-loading.js";

describe("workspace loading components", () => {
  it("renders load banner title, detail, and progress", () => {
    const html = renderToStaticMarkup(
      <TabLoadBanner
        status={{
          detail: "3 / 10 files",
          loadedFiles: 3,
          title: "Loading repository",
          totalFiles: 10
        }}
      />
    );

    expect(html).toContain("Loading repository");
    expect(html).toContain("3 / 10 files");
    expect(html).toContain('aria-label="3 of 10 files loaded"');
    expect(html).toContain("width:30%");
  });

  it("omits progress when counts are unavailable", () => {
    const html = renderToStaticMarkup(
      <LoadingProgress
        status={{
          detail: "Repository",
          title: "Loading repository"
        }}
      />
    );

    expect(html).toBe("");
  });
});
