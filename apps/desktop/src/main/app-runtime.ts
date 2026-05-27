export type AppVariant = "dev" | "production";

export type ResolveAppRuntimeConfigInput = {
  readonly envVariant?: string | undefined;
  readonly executablePath?: string | undefined;
  readonly isPackaged: boolean;
  readonly productName: string;
};

export type AppRuntimeConfig = {
  readonly appId: string;
  readonly name: string;
  readonly userDataDirectoryName: string;
  readonly variant: AppVariant;
};

const productionConfig: AppRuntimeConfig = {
  appId: "com.prof18.difftray",
  name: "Difftray",
  userDataDirectoryName: "Difftray",
  variant: "production"
};

const devConfig: AppRuntimeConfig = {
  appId: "com.prof18.difftray.dev",
  name: "Difftray Dev",
  userDataDirectoryName: "Difftray",
  variant: "dev"
};

export function resolveAppRuntimeConfig(
  input: ResolveAppRuntimeConfigInput
): AppRuntimeConfig {
  if (input.envVariant === "production") {
    return productionConfig;
  }

  if (input.envVariant === "dev") {
    return devConfig;
  }

  const normalizedProductName = input.productName.trim().toLowerCase();
  const normalizedExecutablePath = input.executablePath?.trim().toLowerCase() ?? "";

  if (
    !input.isPackaged ||
    normalizedProductName === "difftray dev" ||
    normalizedExecutablePath.includes("difftray dev.app/") ||
    normalizedExecutablePath.endsWith("/difftray dev") ||
    normalizedExecutablePath.endsWith("\\difftray dev.exe")
  ) {
    return devConfig;
  }

  return productionConfig;
}
