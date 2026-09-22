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

  await checkTouchComments(browser, url);

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
      text: roots
        .map((root) => root.textContent ?? "")
        .join("\n")
        .slice(0, 500)
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
      injectedImages: roots.reduce(
        (count, root) => count + root.querySelectorAll("img").length,
        0
      ),
      injectedJavascriptLinks: roots.reduce(
        (count, root) => count + root.querySelectorAll('a[href^="javascript:"]').length,
        0
      ),
      injectedScripts: roots.reduce(
        (count, root) => count + root.querySelectorAll("script").length,
        0
      ),
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

async function checkTouchComments(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 710, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByRole("button", { name: /Show file/ }).click();
  const gutters = page.locator(
    '.diff-surface [data-column-number][data-line-type="change-addition"]'
  );
  await gutters.first().waitFor();
  const cdp = await context.newCDPSession(page);
  async function touch(locator, holdMs = 0) {
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const box = await locator.boundingBox();
    assert(box, "Missing touch target");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
    });
    if (holdMs) await page.waitForTimeout(holdMs);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(70);
  }
  async function clear() {
    await page.getByRole("button", { name: "Clear", exact: true }).click();
  }
  async function selections() {
    return (await surfaceMessages(page)).filter((m) => m.kind === "line_selected");
  }
  await clear();
  await touch(gutters.first());
  assert(
    (await selections()).length === 1,
    "Short touch must emit one single-line comment"
  );
  assert(
    (await page.getByRole("button", { name: "Comment", exact: true }).count()) === 0,
    "Short tap must not show a range bar"
  );
  await clear();
  await touch(gutters.first(), 650);
  await page.getByRole("button", { name: "Comment", exact: true }).waitFor();
  assert((await selections()).length === 0, "Hold must not open a composer");
  await touch(gutters.nth(3));
  assert((await selections()).length === 0, "Endpoint tap must not open a composer");
  await page.getByRole("button", { name: "Comment", exact: true }).tap();
  const selected = await selections();
  assert(
    selected.length === 1 && selected[0].lineStart === 1 && selected[0].lineEnd === 4,
    "Confirm must emit one range 1–4"
  );
  await clear();
  await touch(gutters.first(), 650);
  await page.getByRole("button", { name: "Cancel", exact: true }).tap();
  assert((await selections()).length === 0, "Cancel must emit nothing");
  await touch(gutters.first(), 650);
  await page.locator('[data-comment-id="harness-comment-1"]').tap();
  assert(
    (await page.getByRole("button", { name: "Comment", exact: true }).count()) === 0,
    "Editing a saved comment must clear selection"
  );
  await clear();
  await page.getByRole("button", { name: /Set draft/ }).click();
  assert((await selections()).length === 0, "Host highlight must not emit a selection");
  await page.getByRole("button", { name: /Show file/ }).click();
  await clear();
  await touch(gutters.nth(3), 650);
  await touch(gutters.first());
  await page.getByRole("button", { name: "Comment", exact: true }).tap();
  assert(
    (await selections()).length === 1 &&
      (await selections())[0].lineStart === 1 &&
      (await selections())[0].lineEnd === 4,
    "Reverse touch range must retain both endpoints"
  );
  await touch(gutters.first(), 650);
  await page.getByRole("button", { name: /Set split mode/ }).click();
  await page
    .getByRole("button", { name: "Comment", exact: true })
    .waitFor({ state: "detached" });
  await touch(gutters.first(), 650);
  await page.getByRole("button", { name: "Load 5k patch", exact: false }).last().click();
  await page
    .getByRole("button", { name: "Comment", exact: true })
    .waitFor({ state: "detached" });
  await clear();
  const surface = page.locator(".diff-surface");
  const largeGutters = page.locator(
    ".diff-surface [data-additions] [data-column-number]"
  );
  await largeGutters.first().waitFor();
  const touchAction = await largeGutters
    .first()
    .evaluate((node) => getComputedStyle(node).touchAction);
  assert(
    touchAction === "pan-y",
    `Gutter touch action must allow vertical scroll: ${touchAction}`
  );
  await touch(largeGutters.first(), 650);
  const startScroll = await surface.evaluate((node) => node.scrollTop);
  const viewport = await surface.boundingBox();
  assert(viewport, "Missing surface viewport");
  const gutterBox = await largeGutters.nth(5).boundingBox();
  assert(gutterBox, "Missing scrolling gutter");
  const x = gutterBox.x + gutterBox.width / 2;
  const y = Math.min(
    viewport.y + viewport.height - 90,
    gutterBox.y + gutterBox.height / 2
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }]
  });
  for (let step = 1; step <= 8; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - step * 12 }]
    });
    await page.waitForTimeout(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(250);
  assert(
    (await surface.evaluate((node) => node.scrollTop)) > startScroll,
    "Gutter touch must scroll the surface"
  );
  assert((await selections()).length === 0, "Scroll must not open a comment");
  assert(
    (await page.getByRole("button", { name: "Comment", exact: true }).count()) === 1,
    "Scroll must retain selected anchor"
  );
  await surface.evaluate((node) => {
    node.scrollTop = 40000;
  });
  await page.waitForTimeout(250);
  const visible = await largeGutters.evaluateAll(
    (nodes, bounds) =>
      nodes
        .filter((node) => {
          const r = node.getBoundingClientRect();
          return r.top > bounds.y + 20 && r.bottom < bounds.y + bounds.height - 70;
        })
        .map((node) => node.getAttribute("data-column-number")),
    viewport
  );
  assert(visible.length > 0, "No virtualized endpoint visible");
  const endpoint = Number(visible[0]);
  await touch(
    page
      .locator(`.diff-surface [data-additions] [data-column-number="${endpoint}"]`)
      .first()
  );
  await surface.screenshot({ path: "/tmp/difftray-touch-range-narrow.png" });
  await page.getByRole("button", { name: "Comment", exact: true }).tap();
  assert(
    (await selections()).length === 1 &&
      (await selections())[0].lineStart === 1 &&
      (await selections())[0].lineEnd === endpoint,
    `Virtualized range must preserve original anchor: ${JSON.stringify({ endpoint, selected: await selections() })}`
  );
  await page.getByRole("button", { name: /Show range fixture/ }).click();
  await clear();
  const oldLine = (n) =>
    page.locator(`.diff-surface [data-deletions] [data-column-number="${n}"]`).first();
  const newLine = (n) =>
    page.locator(`.diff-surface [data-additions] [data-column-number="${n}"]`).first();
  await touch(oldLine(4), 650);
  await touch(newLine(5));
  assert((await selections()).length === 0, "Opposite side must not dispatch");
  await touch(oldLine(1));
  await page.getByRole("button", { name: "Comment", exact: true }).tap();
  const oldRange = (await selections())[0];
  assert(
    oldRange.side === "deletions" && oldRange.lineStart === 1 && oldRange.lineEnd === 4,
    "Split context must retain old-side range"
  );
  await clear();
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.getByTestId("show-second-surface").click();
  const primary = page
    .getByTestId("diff-harness-primary-surface")
    .locator(".diff-surface")
    .first();
  const second = page.getByTestId("diff-harness-second-surface");
  await touch(primary.locator('[data-additions] [data-column-number="1"]').first(), 650);
  await touch(second.locator('[data-additions] [data-column-number="2"]').first());
  assert(
    (await selections()).length === 0,
    "Second surface must not emit into first log"
  );
  assert(
    (await page.getByTestId("diff-harness-second-log").locator("code").count()) === 1,
    "Second surface must emit into its own log once"
  );
  await page.screenshot({ path: "/tmp/difftray-touch-range-multiple.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).tap();
  await page.getByTestId("show-second-surface").click();
  await page.getByRole("button", { name: /Dark theme/ }).click();
  await clear();
  await touch(
    page
      .locator('.diff-surface [data-column-number="3"][data-line-type="change-addition"]')
      .first(),
    650
  );
  await touch(
    page
      .locator('.diff-surface [data-column-number="5"][data-line-type="change-addition"]')
      .first()
  );
  await page
    .locator(".diff-surface-frame")
    .screenshot({ path: "/tmp/difftray-touch-range-dark-wide.png" });
  await page.getByRole("button", { name: "Comment", exact: true }).tap();
  assert(
    (await selections()).length === 1 &&
      (await selections())[0].lineStart === 3 &&
      (await selections())[0].lineEnd === 5,
    "Wrapped unified range must emit once"
  );
  assert(errors.length === 0, `Touch browser errors: ${errors.join("; ")}`);
  await context.close();
}
