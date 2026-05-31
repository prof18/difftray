import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findEditorPresetByLaunchConfig } from "@difftray/core";
import type { EditorLaunchConfig } from "@difftray/storage";

const loopbackHostnames = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export type TrustedRendererLocation =
  | {
      readonly kind: "dev";
      readonly origin: string;
    }
  | {
      readonly kind: "file";
      readonly path: string;
    };

export function resolveRendererDevUrl(
  rawUrl: string | undefined,
  isPackaged: boolean
): string | undefined {
  const trimmedUrl = rawUrl?.trim();

  if (!trimmedUrl) {
    return undefined;
  }

  if (isPackaged) {
    throw new Error("Renderer dev URL is not allowed in packaged builds.");
  }

  const url = new URL(trimmedUrl);

  if (url.protocol !== "http:") {
    throw new Error("Renderer dev URL must use http.");
  }

  if (!loopbackHostnames.has(url.hostname)) {
    throw new Error("Renderer dev URL must point to a loopback host.");
  }

  return url.toString();
}

export async function resolveSafeProjectFilePath(
  projectPath: string,
  relativeFilePath: string
): Promise<string | undefined> {
  const absoluteProjectPath = path.resolve(projectPath);
  const absoluteFilePath = path.resolve(absoluteProjectPath, relativeFilePath);

  if (!isPathContained(absoluteProjectPath, absoluteFilePath)) {
    return undefined;
  }

  try {
    const [realProjectPath, realFilePath] = await Promise.all([
      realpath(absoluteProjectPath),
      realpath(absoluteFilePath)
    ]);

    if (!isPathContained(realProjectPath, realFilePath)) {
      return undefined;
    }

    return absoluteFilePath;
  } catch {
    return undefined;
  }
}

export function isTrustedRendererUrl(
  rawUrl: string,
  location: TrustedRendererLocation
): boolean {
  try {
    const url = new URL(rawUrl);

    if (location.kind === "dev") {
      return url.origin === location.origin;
    }

    if (url.protocol !== "file:") {
      return false;
    }

    return path.resolve(fileURLToPath(url)) === path.resolve(location.path);
  } catch {
    return false;
  }
}

export function trustedEditorLaunchConfig(
  launchConfig: EditorLaunchConfig | undefined
): EditorLaunchConfig | undefined {
  if (!launchConfig) {
    return undefined;
  }

  const normalizedConfig = {
    args: launchConfig.args.map((arg) => arg.trim()).filter((arg) => arg.length > 0),
    command: launchConfig.command.trim()
  };

  return findEditorPresetByLaunchConfig(normalizedConfig) ? normalizedConfig : undefined;
}

function isPathContained(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
