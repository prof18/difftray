type RepositoryDropZoneCallbacks = {
  readonly onFoldersDropped: (files: readonly File[]) => void;
  readonly setActive: (active: boolean) => void;
};

type RepositoryDropZone = {
  readonly onDragEnter: (event: DragEvent) => void;
  readonly onDragLeave: (event: DragEvent) => void;
  readonly onDragOver: (event: DragEvent) => void;
  readonly onDrop: (event: DragEvent) => void;
};

function hasFilePayload(dataTransfer: DataTransfer | null): boolean {
  return (
    Array.from(dataTransfer?.types ?? []).includes("Files") ||
    Array.from(dataTransfer?.items ?? []).some((item) => item.kind === "file") ||
    (dataTransfer?.files.length ?? 0) > 0
  );
}

type DroppedFolderInspection = {
  readonly hasDirectoryEntry: boolean;
  readonly hasDirectoryEntryWithoutFile: boolean;
  readonly hasUnknownFileEntry: boolean;
  readonly folders: readonly File[];
};

function inspectDroppedFolders(
  dataTransfer: DataTransfer | null
): DroppedFolderInspection | undefined {
  let inspectedEntry = false;
  let hasDirectoryEntry = false;
  let hasDirectoryEntryWithoutFile = false;
  let hasUnknownFileEntry = false;
  const folders: File[] = [];

  for (const item of Array.from(dataTransfer?.items ?? [])) {
    if (item.kind !== "file") continue;

    let entry: FileSystemEntry | null = null;
    try {
      entry = item.webkitGetAsEntry();
    } catch {
      // Some drag sources expose files without filesystem entry metadata.
    }
    if (!entry) {
      hasUnknownFileEntry = true;
      continue;
    }

    inspectedEntry = true;
    if (!entry.isDirectory) continue;
    hasDirectoryEntry = true;

    const folder = item.getAsFile();
    if (folder) {
      folders.push(folder);
    } else {
      hasDirectoryEntryWithoutFile = true;
    }
  }

  return inspectedEntry
    ? {
        hasDirectoryEntry,
        hasDirectoryEntryWithoutFile,
        hasUnknownFileEntry,
        folders
      }
    : undefined;
}

export function createRepositoryDropZone(
  callbacks: RepositoryDropZoneCallbacks
): RepositoryDropZone {
  let dragDepth = 0;

  function onDragEnter(event: DragEvent): void {
    if (!hasFilePayload(event.dataTransfer)) return;
    event.preventDefault();

    const folders = inspectDroppedFolders(event.dataTransfer);
    if (folders && !folders.hasDirectoryEntry && !folders.hasUnknownFileEntry) {
      dragDepth = 0;
      callbacks.setActive(false);
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
      return;
    }

    dragDepth += 1;
    callbacks.setActive(true);
  }

  function onDragOver(event: DragEvent): void {
    if (!hasFilePayload(event.dataTransfer)) return;
    event.preventDefault();

    const folders = inspectDroppedFolders(event.dataTransfer);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect =
        folders && !folders.hasDirectoryEntry && !folders.hasUnknownFileEntry
          ? "none"
          : "copy";
    }
  }

  function onDragLeave(event: DragEvent): void {
    if (dragDepth === 0) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) callbacks.setActive(false);
  }

  function onDrop(event: DragEvent): void {
    const wasActive = dragDepth > 0;
    const hasFiles = hasFilePayload(event.dataTransfer);
    const inspectedFolders = inspectDroppedFolders(event.dataTransfer);

    dragDepth = 0;
    callbacks.setActive(false);

    if (!wasActive && !hasFiles) return;
    event.preventDefault();

    const folders = inspectedFolders
      ? inspectedFolders.hasUnknownFileEntry ||
        inspectedFolders.hasDirectoryEntryWithoutFile ||
        (inspectedFolders.hasDirectoryEntry && inspectedFolders.folders.length === 0)
        ? Array.from(event.dataTransfer?.files ?? [])
        : inspectedFolders.folders
      : Array.from(event.dataTransfer?.files ?? []);
    callbacks.onFoldersDropped(folders);
  }

  return { onDragEnter, onDragLeave, onDragOver, onDrop };
}
