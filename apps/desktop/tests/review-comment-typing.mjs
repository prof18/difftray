import path from "node:path";

export async function expectStableCommentTyping(window, artifactsDir) {
  const editor = window.getByRole("textbox", { name: "Review comment" });
  const layout = await window
    .locator("[data-diff-layout]")
    .getAttribute("data-diff-layout");
  await editor.waitFor();
  await editor.focus();
  await window.waitForTimeout(300);
  const probe = await window.evaluateHandle(() => {
    const surface = document.querySelector("[data-diff-layout]");
    const shadow = surface?.querySelector("diffs-container")?.shadowRoot;
    const codes = Array.from(shadow?.querySelectorAll("[data-code]") ?? []);
    if (!surface || !shadow || codes.length === 0) {
      throw new Error("Missing comment diff scrollers");
    }
    const metrics = () => ({
      top: surface.scrollTop,
      height: surface.scrollHeight,
      codes: codes.map((code) => [
        code.isConnected,
        code.scrollLeft,
        code.clientWidth,
        code.scrollWidth
      ]),
      scrollbars: Array.from(surface.querySelectorAll('[role="scrollbar"]')).map(
        (track) => {
          const thumb = track.firstElementChild;
          const rect = track.getBoundingClientRect();
          const style = getComputedStyle(track);
          return {
            bounds: [rect.x, rect.y, rect.width, rect.height],
            visibility: [style.display, style.visibility, style.opacity],
            thumb: thumb
              ? [getComputedStyle(thumb).width, getComputedStyle(thumb).transform]
              : null
          };
        }
      )
    });
    const initial = metrics();
    if (initial.scrollbars.length === 0) throw new Error("Missing horizontal scrollbar");
    let removedCodeNodes = 0;
    let shiftedFrames = 0;
    let frames = 0;
    let frame;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (
          codes.some((code) => code === record.target || code.contains(record.target))
        ) {
          removedCodeNodes += record.removedNodes.length;
        }
      }
    });
    observer.observe(shadow, { childList: true, subtree: true });
    function sample() {
      frames += 1;
      if (JSON.stringify(metrics()) !== JSON.stringify(initial)) shiftedFrames += 1;
      frame = requestAnimationFrame(sample);
    }
    frame = requestAnimationFrame(sample);
    return {
      finish() {
        cancelAnimationFrame(frame);
        observer.disconnect();
        return { initial, final: metrics(), removedCodeNodes, shiftedFrames, frames };
      }
    };
  });
  const body = "Please show a useful error message instead of an HTTP status code.";
  await editor.pressSequentially(body, { delay: 20 });
  await window.waitForTimeout(100);
  const state = await probe.evaluate((probe) => probe.finish());
  await probe.dispose();
  if ((await editor.inputValue()) !== body) throw new Error("Typing lost comment text");
  if (state.removedCodeNodes > 0 || state.shiftedFrames > 0 || state.frames === 0) {
    throw new Error(
      `Comment typing rebuilt or shifted the diff: ${JSON.stringify(state)}`
    );
  }
  await window.screenshot({
    path: path.join(artifactsDir, `desktop-comment-typing-stable-${layout}.png`)
  });
  console.log(
    `Comment typing kept ${layout} diff nodes and scrollbars stable (${state.frames} frames).`
  );
}
