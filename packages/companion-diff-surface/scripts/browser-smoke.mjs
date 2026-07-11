import { createRequire } from "node:module";
import { createServer as createTcpServer } from "node:net";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const require = createRequire(
  new URL("../../../apps/desktop/package.json", import.meta.url)
);
const { chromium } = require("playwright");
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const port = await findFreePort();
const server = await createServer({
  logLevel: "error",
  root: packageRoot,
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true
  }
});

let browser;

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];

  assert(url, "Vite did not expose a local URL");

  browser = await launchBrowser();

  const page = await browser.newPage({
    viewport: { height: 844, width: 390 }
  });
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
  });

  await page.goto(url);
  await page.locator(".diff-harness").waitFor({ timeout: 10_000 });
  await waitForSurfaceMessage(page, (message) => message.kind === "ready", "ready");
  const loadedFontFamilies = await page.evaluate(async () => {
    await document.fonts.ready;

    return Array.from(document.fonts, (fontFace) => fontFace.family).sort();
  });

  assert(
    loadedFontFamilies.includes("IBM Plex Sans") &&
      loadedFontFamilies.includes("JetBrains Mono"),
    `Expected bundled IBM Plex Sans and JetBrains Mono font faces, saw ${loadedFontFamilies.join(", ")}`
  );

  await page.getByRole("button", { name: /Init/ }).click();
  await page
    .locator('.diff-surface[data-diff-mode="unified"][data-wrap-lines="true"]')
    .waitFor({ timeout: 10_000 });

  await page.getByRole("button", { name: /Disable wrapping/ }).click();
  await page
    .locator('.diff-surface[data-diff-mode="unified"][data-wrap-lines="false"]')
    .waitFor({ timeout: 10_000 });
  const noWrapWhiteSpace = await page
    .locator(".diff-surface [data-line]")
    .first()
    .evaluate((element) => getComputedStyle(element).whiteSpace);

  assert(
    noWrapWhiteSpace === "pre",
    `Expected wrapLines=false to preserve lines with white-space: pre, saw ${noWrapWhiteSpace}`
  );
  const noWrapOverflow = await page.locator(".diff-surface").evaluate((surface) => {
    return {
      surfaceOverflowX: getComputedStyle(surface).overflowX
    };
  });

  assert(
    noWrapOverflow.surfaceOverflowX === "hidden",
    `Expected no-wrap mode to keep page overflow hidden, saw ${JSON.stringify(noWrapOverflow)}`
  );

  await page.getByRole("button", { name: /Show file/ }).click();
  await page
    .locator(".diff-surface__path")
    .filter({ hasText: "src/harness-fixture.ts" })
    .waitFor({ timeout: 10_000 });
  await waitForSurfaceMessage(
    page,
    (message) => message.kind === "rendered" && message.path === "src/harness-fixture.ts",
    "fixture rendered"
  );
  await expectHostileFixtureIsInert(page);

  await page
    .locator('button.diff-surface__annotation[data-comment-id="harness-comment-1"]')
    .click();
  await waitForSurfaceMessage(
    page,
    (message) => message.kind === "comment_tapped",
    "comment tapped"
  );

  await page
    .locator('.diff-surface [data-column-number][data-line-type="change-addition"]')
    .first()
    .click();
  await waitForSurfaceMessage(
    page,
    (message) => message.kind === "line_selected" && message.side === "additions",
    "line selected"
  );
  const additionGutters = page.locator(
    '.diff-surface [data-column-number][data-line-type="change-addition"]'
  );
  await additionGutters.first().dragTo(additionGutters.nth(3));
  await waitForSurfaceMessage(
    page,
    (message) =>
      message.kind === "line_selected" &&
      message.side === "additions" &&
      message.lineStart === 1 &&
      message.lineEnd === 4,
    "line range selected"
  );

  await page.getByRole("button", { name: /Set comments/ }).click();
  await page.getByText("Updated from browser harness").waitFor({ timeout: 10_000 });

  await page.getByRole("button", { name: /Set split mode/ }).click();
  await page.locator('.diff-surface[data-diff-mode="split"]').waitFor({
    timeout: 10_000
  });

  await page.getByRole("button", { name: /Set draft/ }).click();
  await page.locator('.diff-surface__annotation[data-draft="true"]').waitFor({
    timeout: 10_000
  });

  await page.getByRole("button", { name: /^Clear$/ }).click();
  await page.getByRole("button", { name: /Manual smooth-scroll/ }).click();
  await page
    .locator(".diff-surface__path")
    .filter({ hasText: "src/large-fixture.ts" })
    .waitFor({ timeout: 10_000 });
  await waitForSurfaceMessage(
    page,
    (message) => message.kind === "rendered" && message.path === "src/large-fixture.ts",
    "large fixture rendered"
  );

  const renderedRows = await page.locator(".diff-surface [data-line]").count();

  assert(
    renderedRows > 0,
    `Expected Pierre to render a visible virtual window, saw ${String(renderedRows)} rows`
  );

  await page.getByRole("button", { name: /^Clear$/ }).click();
  await page.getByRole("button", { name: /Load 5k patch at line 4800/ }).click();
  await waitForSurfaceMessage(
    page,
    (message) => message.kind === "rendered" && message.path === "src/large-fixture.ts",
    "large fixture scroll target rendered"
  );
  const targetViewportPosition = await waitForLineNumberInSurface(page, 4800);

  assert(
    targetViewportPosition &&
      targetViewportPosition.top >= targetViewportPosition.surfaceTop &&
      targetViewportPosition.bottom <= targetViewportPosition.surfaceBottom,
    `Expected scrollTo target line 4800 to be visible, saw ${JSON.stringify(targetViewportPosition)}`
  );

  const scrollProbe = await page.locator(".diff-surface").evaluate(async (element) => {
    const maxScrollTop = element.scrollHeight - element.clientHeight;
    const frameDeltas = [];
    let lastFrameMs = performance.now();

    for (let step = 0; step <= 60; step += 1) {
      await new Promise((resolve) => {
        requestAnimationFrame((frameMs) => {
          frameDeltas.push(frameMs - lastFrameMs);
          lastFrameMs = frameMs;
          resolve(undefined);
        });
      });
      element.scrollTop = Math.round(maxScrollTop * (step / 60));
    }

    return {
      finalScrollTop: element.scrollTop,
      frameCount: frameDeltas.length,
      maxFrameDeltaMs: Math.max(...frameDeltas.slice(1)),
      maxScrollTop
    };
  });

  assert(
    scrollProbe.maxScrollTop > 1_000,
    "Large fixture did not create a scrollable surface"
  );
  assert(scrollProbe.finalScrollTop > 0, "Large fixture did not scroll");
  assert(
    scrollProbe.maxFrameDeltaMs < 250,
    `Large fixture scroll stalled for ${String(Math.round(scrollProbe.maxFrameDeltaMs))}ms`
  );

  assert(
    browserErrors.length === 0,
    `Browser reported errors:\n${browserErrors.join("\n")}`
  );
} finally {
  await browser?.close();
  await server.close();
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist")) {
      throw error;
    }

    return chromium.launch({ channel: "chrome" });
  }
}

async function waitForSurfaceMessage(page, predicate, label) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    const messages = await surfaceMessages(page);

    if (messages.some(predicate)) {
      return;
    }

    await page.waitForTimeout(50);
  }

  throw new Error(`Timed out waiting for surface message: ${label}`);
}

async function surfaceMessages(page) {
  const texts = await page.locator(".diff-harness__log code").allTextContents();

  return texts.flatMap((text) => {
    try {
      return [JSON.parse(text)];
    } catch {
      return [];
    }
  });
}

async function waitForLineNumberInSurface(page, lineNumber) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    const position = await lineNumberPositionInSurface(page, lineNumber);

    if (position) {
      return position;
    }

    await page.waitForTimeout(50);
  }

  throw new Error(
    `Timed out waiting for line number ${String(lineNumber)}; ${JSON.stringify(
      await surfaceLineDiagnostics(page)
    )}`
  );
}

async function lineNumberPositionInSurface(page, lineNumber) {
  return page.locator(".diff-surface").evaluate((surface, targetLineNumber) => {
    const roots = [
      surface,
      ...Array.from(surface.querySelectorAll("diffs-container"))
        .map((container) => container.shadowRoot)
        .filter((root) => root !== null)
    ];
    const selector = `[data-column-number="${String(targetLineNumber)}"]`;
    const target = roots
      .flatMap((root) => Array.from(root.querySelectorAll(selector)))
      .at(0);
    const surfaceBounds = surface.getBoundingClientRect();
    const targetBounds = target?.getBoundingClientRect();

    return targetBounds
      ? {
          bottom: targetBounds.bottom,
          surfaceBottom: surfaceBounds.bottom,
          surfaceTop: surfaceBounds.top,
          top: targetBounds.top
        }
      : null;
  }, lineNumber);
}

async function surfaceLineDiagnostics(page) {
  return page.locator(".diff-surface").evaluate((surface) => {
    const roots = [
      surface,
      ...Array.from(surface.querySelectorAll("diffs-container"))
        .map((container) => container.shadowRoot)
        .filter((root) => root !== null)
    ];
    const lineNumbers = roots
      .flatMap((root) =>
        Array.from(root.querySelectorAll("[data-column-number]"), (element) =>
          element.getAttribute("data-column-number")
        )
      )
      .filter((lineNumber) => lineNumber !== null)
      .slice(0, 20);

    return {
      clientHeight: surface.clientHeight,
      lineNumbers,
      path: surface.querySelector(".diff-surface__path")?.textContent ?? null,
      scrollHeight: surface.scrollHeight,
      scrollTop: surface.scrollTop,
      text: roots.map((root) => root.textContent ?? "").join("\n").slice(0, 500)
    };
  });
}

async function expectHostileFixtureIsInert(page) {
  const result = await page.locator(".diff-surface").evaluate((element) => {
    const roots = [
      element,
      ...Array.from(element.querySelectorAll("diffs-container"))
        .map((container) => container.shadowRoot)
        .filter((root) => root !== null)
    ];
    const text = roots.map((root) => root.textContent ?? "").join("\n");

    return {
      hostileTextVisible: text.includes("<img src=x onerror="),
      injectedImages: roots.reduce((count, root) => count + root.querySelectorAll("img").length, 0),
      injectedJavascriptLinks: roots.reduce(
        (count, root) => count + root.querySelectorAll('a[href^="javascript:"]').length,
        0
      ),
      injectedScripts: roots.reduce((count, root) => count + root.querySelectorAll("script").length, 0),
      xssExecuted: window.__difftrayHarnessXss === true
    };
  });

  assert(result.hostileTextVisible, "Hostile fixture text was not visible as text");
  assert(!result.xssExecuted, "Hostile fixture executed script");
  assert(result.injectedScripts === 0, "Hostile fixture injected script nodes");
  assert(result.injectedImages === 0, "Hostile fixture injected image nodes");
  assert(
    result.injectedJavascriptLinks === 0,
    "Hostile fixture injected javascript links"
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer();

    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();

      probe.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Failed to reserve a free local port"));
      });
    });
  });
}
