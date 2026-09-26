export type AppVariant = "dev" | "production";
export type AppFlavor = "alpha" | "dev" | "production";
export type WindowPresentationMode = "active" | "inactive";

export type ResolveAppRuntimeConfigInput = {
  readonly envVariant?: string | undefined;
  readonly executablePath?: string | undefined;
  readonly isPackaged: boolean;
  readonly productName: string;
};

export type AppRuntimeConfig = {
  readonly appId: string;
  readonly flavor: AppFlavor;
  readonly name: string;
  readonly userDataDirectoryName: string;
  // "dev" covers both the Alpha packaged build and unpackaged runs; use `flavor` to tell them apart.
  readonly variant: AppVariant;
};

const productionConfig: AppRuntimeConfig = {
  appId: "com.prof18.difftray",
  flavor: "production",
  name: "Difftray",
  userDataDirectoryName: "Difftray",
  variant: "production"
};

const devConfig: AppRuntimeConfig = {
  appId: "com.prof18.difftray.dev",
  flavor: "dev",
  name: "Difftray Dev",
  userDataDirectoryName: "Difftray Dev",
  variant: "dev"
};

const alphaConfig: AppRuntimeConfig = {
  ...devConfig,
  flavor: "alpha",
  name: "Difftray Alpha"
};

export function resolveAppRuntimeConfig(
  input: ResolveAppRuntimeConfigInput
): AppRuntimeConfig {
  if (input.envVariant === "production") {
    return productionConfig;
  }

  if (input.envVariant === "alpha") {
    return alphaConfig;
  }

  if (input.envVariant === "dev") {
    return devConfig;
  }

  if (!input.isPackaged) {
    return devConfig;
  }

  const normalizedProductName = input.productName.trim().toLowerCase();
  const normalizedExecutablePath = input.executablePath?.trim().toLowerCase() ?? "";

  if (
    normalizedProductName === "difftray alpha" ||
    normalizedProductName === "difftray dev" ||
    normalizedExecutablePath.includes("difftray alpha.app/") ||
    normalizedExecutablePath.includes("difftray dev.app/") ||
    normalizedExecutablePath.endsWith("/difftray alpha") ||
    normalizedExecutablePath.endsWith("/difftray dev") ||
    normalizedExecutablePath.endsWith("\\difftray alpha.exe") ||
    normalizedExecutablePath.endsWith("\\difftray dev.exe")
  ) {
    return alphaConfig;
  }

  return productionConfig;
}

export function resolveWindowPresentationMode(
  value: string | undefined
): WindowPresentationMode {
  return value === "inactive" ? "inactive" : "active";
}
