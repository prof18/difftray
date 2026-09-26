import { describe, expect, it } from "vitest";

import { resolveAppRuntimeConfig, resolveWindowPresentationMode } from "./app-runtime.js";

describe("resolveAppRuntimeConfig", () => {
  it("uses the production app id for packaged production builds", () => {
    expect(
      resolveAppRuntimeConfig({ isPackaged: true, productName: "Difftray" })
    ).toMatchObject({
      appId: "com.prof18.difftray",
      flavor: "production",
      name: "Difftray",
      userDataDirectoryName: "Difftray",
      variant: "production"
    });
  });

  it("uses the dev app id for unpackaged local runs", () => {
    expect(
      resolveAppRuntimeConfig({ isPackaged: false, productName: "Electron" })
    ).toMatchObject({
      appId: "com.prof18.difftray.dev",
      flavor: "dev",
      name: "Difftray Dev",
      userDataDirectoryName: "Difftray Dev",
      variant: "dev"
    });
  });

  it("treats the legacy packaged Dev product as the Alpha flavor", () => {
    expect(
      resolveAppRuntimeConfig({ isPackaged: true, productName: "Difftray Dev" })
    ).toMatchObject({
      appId: "com.prof18.difftray.dev",
      flavor: "alpha",
      name: "Difftray Alpha",
      userDataDirectoryName: "Difftray Dev",
      variant: "dev"
    });
  });

  it("uses the Alpha product name without changing app identity or storage", () => {
    expect(
      resolveAppRuntimeConfig({ isPackaged: true, productName: "Difftray Alpha" })
    ).toEqual({
      appId: "com.prof18.difftray.dev",
      flavor: "alpha",
      name: "Difftray Alpha",
      userDataDirectoryName: "Difftray Dev",
      variant: "dev"
    });
  });

  it("detects packaged Alpha builds from the executable path", () => {
    expect(
      resolveAppRuntimeConfig({
        executablePath: "/Applications/Difftray Alpha.app/Contents/MacOS/Difftray Alpha",
        isPackaged: true,
        productName: "difftray"
      })
    ).toMatchObject({
      appId: "com.prof18.difftray.dev",
      flavor: "alpha",
      variant: "dev"
    });
  });

  it("lets scripts force the Alpha flavor", () => {
    expect(
      resolveAppRuntimeConfig({
        envVariant: "alpha",
        isPackaged: false,
        productName: "Electron"
      })
    ).toEqual({
      appId: "com.prof18.difftray.dev",
      flavor: "alpha",
      name: "Difftray Alpha",
      userDataDirectoryName: "Difftray Dev",
      variant: "dev"
    });
  });

  it("lets scripts force the production variant", () => {
    expect(
      resolveAppRuntimeConfig({
        envVariant: "production",
        isPackaged: false,
        productName: "Electron"
      })
    ).toMatchObject({
      appId: "com.prof18.difftray",
      flavor: "production",
      variant: "production"
    });
  });
});

describe("resolveWindowPresentationMode", () => {
  it("shows windows actively by default", () => {
    expect(resolveWindowPresentationMode(undefined)).toBe("active");
  });

  it("lets automated app tests show without taking focus", () => {
    expect(resolveWindowPresentationMode("inactive")).toBe("inactive");
  });

  it("falls back to active presentation for unknown values", () => {
    expect(resolveWindowPresentationMode("background")).toBe("active");
  });
});
