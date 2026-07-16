/** @vitest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageDiff } from "./image-diff.js";

describe("ImageDiff", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("lazily renders before and after images for a modified binary diff", async () => {
    const loadImage = vi.fn((side: FileImageSide) =>
      Promise.resolve(imageResponse(side))
    );

    await act(async () => {
      root.render(
        <StrictMode>
          <ImageDiff
            diffHash="hash-binary"
            diffSideFocus="both"
            fallback={<div>Binary fallback</div>}
            loadImage={loadImage}
            status="modified"
          />
        </StrictMode>
      );
      await Promise.resolve();
    });

    expect(loadImage).toHaveBeenCalledTimes(2);
    expect(loadImage).toHaveBeenCalledWith("old");
    expect(loadImage).toHaveBeenCalledWith("new");
    expect(container.textContent).toContain("Before");
    expect(container.textContent).toContain("After");
    expect(container.textContent).toContain("320 × 180");
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(
      container
        .querySelector('img[alt="Before image, 320 by 180 pixels"]')
        ?.getAttribute("src")
    ).toBe("data:image/png;base64,b2xk");
    expect(
      container
        .querySelector('img[alt="After image, 320 by 180 pixels"]')
        ?.getAttribute("src")
    ).toBe("data:image/png;base64,bmV3");
  });

  it("loads only the focused image side", async () => {
    const loadImage = vi.fn((side: FileImageSide) =>
      Promise.resolve(imageResponse(side))
    );

    await act(async () => {
      root.render(
        <ImageDiff
          diffHash="hash-binary"
          diffSideFocus="new"
          fallback={<div>Binary fallback</div>}
          loadImage={loadImage}
          status="modified"
        />
      );
      await Promise.resolve();
    });

    expect(loadImage).toHaveBeenCalledOnce();
    expect(loadImage).toHaveBeenCalledWith("new");
    expect(container.textContent).not.toContain("Before");
    expect(container.textContent).toContain("After");
  });

  it.each([
    ["added", "new"],
    ["deleted", "old"]
  ] as const)("loads only the available side for a %s image", async (status, side) => {
    const loadImage = vi.fn((requestedSide: FileImageSide) =>
      Promise.resolve(imageResponse(requestedSide))
    );

    await renderImageDiff(loadImage, status);

    expect(loadImage).toHaveBeenCalledOnce();
    expect(loadImage).toHaveBeenCalledWith(side);
  });

  it("keeps the binary fallback for unsupported image content", async () => {
    const loadImage = vi.fn(() => Promise.resolve(null));

    await act(async () => {
      root.render(
        <ImageDiff
          diffHash="hash-binary"
          diffSideFocus="both"
          fallback={<div>Binary fallback</div>}
          loadImage={loadImage}
          status="modified"
        />
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Binary fallback");
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the complete binary fallback when one side is unavailable", async () => {
    const loadImage = vi.fn((side: FileImageSide) =>
      Promise.resolve(side === "old" ? imageResponse(side) : null)
    );

    await renderImageDiff(loadImage);

    expect(container.textContent).toContain("Binary fallback");
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the complete binary fallback when one side fails to load", async () => {
    const loadImage = vi.fn((side: FileImageSide) =>
      side === "old"
        ? Promise.resolve(imageResponse(side))
        : Promise.reject(new Error("image changed during load"))
    );

    await renderImageDiff(loadImage);

    expect(container.textContent).toContain("Binary fallback");
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps the binary fallback when the browser cannot decode an image", async () => {
    await renderImageDiff((side) => Promise.resolve(imageResponse(side)));
    const image = container.querySelector("img");

    expect(image).not.toBeNull();
    act(() => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(container.textContent).toContain("Binary fallback");
    expect(container.querySelector("img")).toBeNull();
  });

  it.each([
    ["a stale diff hash", { diffHash: "stale-hash" }],
    ["the wrong side", { side: "new" as const }]
  ])("rejects a response with %s", async (_label, patch) => {
    await renderImageDiff((side) =>
      Promise.resolve({ ...imageResponse(side), ...patch })
    );

    expect(container.textContent).toContain("Binary fallback");
    expect(container.querySelector("img")).toBeNull();
  });

  async function renderImageDiff(
    loadImage: (side: FileImageSide) => Promise<FileImageView | null>,
    status: ReviewFileView["status"] = "modified"
  ): Promise<void> {
    await act(async () => {
      root.render(
        <ImageDiff
          diffHash="hash-binary"
          diffSideFocus="both"
          fallback={<div>Binary fallback</div>}
          loadImage={loadImage}
          status={status}
        />
      );
      await Promise.resolve();
    });
  }
});

function imageResponse(side: FileImageSide): FileImageView {
  return {
    diffHash: "hash-binary",
    image: {
      dataBase64: side === "old" ? "b2xk" : "bmV3",
      height: 180,
      mimeType: "image/png",
      width: 320
    },
    side
  };
}
