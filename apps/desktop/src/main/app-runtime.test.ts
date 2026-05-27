import { describe, expect, it } from "vitest";

import { resolveAppRuntimeConfig } from "./app-runtime.js";

describe("resolveAppRuntimeConfig", () => {
  it("uses the production app id for packaged production builds", () => {
    expect(
      resolveAppRuntimeConfig({ isPackaged: true, productName: "Difftray" })
    ).toMatchObject({
      appId: "com.prof18.difftray",
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
      name: "Difftray Dev",
      userDataDirectoryName: "Difftray",
      variant: "dev"
    });
  });

  it("uses the dev app id for packaged dev builds", () => {
    expect(
      resolveAppRuntimeConfig({ isPackaged: true, productName: "Difftray Dev" })
    ).toMatchObject({
      appId: "com.prof18.difftray.dev",
      variant: "dev"
    });
  });

  it("detects packaged dev builds from the executable path", () => {
    expect(
      resolveAppRuntimeConfig({
        executablePath: "/Applications/Difftray Dev.app/Contents/MacOS/Difftray Dev",
        isPackaged: true,
        productName: "difftray"
      })
    ).toMatchObject({
      appId: "com.prof18.difftray.dev",
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
      variant: "production"
    });
  });
});
