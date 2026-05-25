import { fileURLToPath } from "node:url";

import type { AliasOptions } from "vite";

export const workspaceAliases = [
  {
    find: /^@difftray\/core$/,
    replacement: fileURLToPath(
      new URL("../../packages/core/src/index.ts", import.meta.url)
    )
  },
  {
    find: /^@difftray\/core\/editor-presets$/,
    replacement: fileURLToPath(
      new URL("../../packages/core/src/editor-presets.ts", import.meta.url)
    )
  },
  {
    find: /^@difftray\/git$/,
    replacement: fileURLToPath(
      new URL("../../packages/git/src/index.ts", import.meta.url)
    )
  },
  {
    find: /^@difftray\/storage$/,
    replacement: fileURLToPath(
      new URL("../../packages/storage/src/index.ts", import.meta.url)
    )
  }
] satisfies AliasOptions;
