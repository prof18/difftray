import { describe, expect, it, vi } from "vitest";

import { createRepositoryDropZone } from "./repository-drop-zone.js";

type DragData = {
  readonly files?: readonly File[];
  readonly items?: readonly DataTransferItem[];
  readonly types?: readonly string[];
};

function file(name: string): File {
  return { name } as File;
}

function item(droppedFile: File | null, isDirectory: boolean): DataTransferItem {
  return {
    getAsFile: () => droppedFile,
    kind: "file",
    webkitGetAsEntry: () => ({ isDirectory }) as FileSystemEntry
  } as DataTransferItem;
}

function target(): EventTarget & { isConnected: boolean } {
  return { isConnected: true } as unknown as EventTarget & { isConnected: boolean };
}

function dragEvent(data: DragData, eventTarget: EventTarget = target()): DragEvent {
  return {
    dataTransfer: {
      dropEffect: "none",
      files: data.files ?? [],
      items: data.items ?? [],
      types: data.types ?? []
    },
    preventDefault: vi.fn(),
    target: eventTarget
  } as unknown as DragEvent;
}

describe("repository drop zone", () => {
  it("does not activate image file drags but still handles the external drop", () => {
    const setActive = vi.fn();
    const onFoldersDropped = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped, setActive });
    const image = file("screenshot.png");
    const enter = dragEvent({
      files: [image],
      items: [item(image, false)],
      types: ["Files"]
    });

    zone.onDragEnter(enter);
    zone.onDrop(enter);

    expect(setActive).not.toHaveBeenCalledWith(true);
    expect(setActive).toHaveBeenLastCalledWith(false);
    expect(onFoldersDropped).toHaveBeenCalledWith([]);
  });

  it("closes after a folder drop even when the drop event loses its type metadata", () => {
    const setActive = vi.fn();
    const onFoldersDropped = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped, setActive });
    const folder = file("repository");

    zone.onDragEnter(
      dragEvent({
        files: [folder],
        items: [item(folder, true)],
        types: ["Files"]
      })
    );
    const drop = dragEvent({ files: [folder] });
    zone.onDrop(drop);

    expect(setActive).toHaveBeenNthCalledWith(1, true);
    expect(setActive).toHaveBeenLastCalledWith(false);
    expect(drop.preventDefault).toHaveBeenCalledOnce();
    expect(onFoldersDropped).toHaveBeenCalledWith([folder]);
  });

  it("accepts a directory during drag when its file is not yet available", () => {
    const setActive = vi.fn();
    const onFoldersDropped = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped, setActive });
    const enter = dragEvent({
      items: [item(null, true)],
      types: ["Files"]
    });

    zone.onDragEnter(enter);
    zone.onDragOver(enter);

    expect(setActive).toHaveBeenCalledWith(true);
    expect(enter.dataTransfer?.dropEffect).toBe("copy");
  });

  it("falls back to dataTransfer files when a directory file is unavailable on drop", () => {
    const setActive = vi.fn();
    const onFoldersDropped = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped, setActive });
    const folder = file("repository");
    const drop = dragEvent({
      files: [folder],
      items: [item(null, true)],
      types: ["Files"]
    });

    zone.onDragEnter(drop);
    zone.onDrop(drop);

    expect(onFoldersDropped).toHaveBeenCalledWith([folder]);
  });

  it("keeps every dropped folder when one directory entry has no file", () => {
    const setActive = vi.fn();
    const onFoldersDropped = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped, setActive });
    const firstFolder = file("first-repository");
    const secondFolder = file("second-repository");
    const drop = dragEvent({
      files: [firstFolder, secondFolder],
      items: [item(firstFolder, true), item(null, true)],
      types: ["Files"]
    });

    zone.onDragEnter(drop);
    zone.onDrop(drop);

    expect(onFoldersDropped).toHaveBeenCalledWith([firstFolder, secondFolder]);
  });

  it("falls back when a known file entry is mixed with an unknown folder entry", () => {
    const setActive = vi.fn();
    const onFoldersDropped = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped, setActive });
    const regularFile = file("notes.txt");
    const folder = file("repository");
    const unknownEntry = {
      getAsFile: () => folder,
      kind: "file",
      webkitGetAsEntry: () => null
    } as unknown as DataTransferItem;
    const drop = dragEvent({
      files: [regularFile, folder],
      items: [item(regularFile, false), unknownEntry],
      types: ["Files"]
    });

    zone.onDragEnter(drop);
    zone.onDragOver(drop);
    zone.onDrop(drop);

    expect(setActive).toHaveBeenCalledWith(true);
    expect(drop.dataTransfer?.dropEffect).toBe("copy");
    expect(onFoldersDropped).toHaveBeenCalledWith([regularFile, folder]);
  });

  it("closes when the drag leaves after the element it entered was removed", () => {
    const setActive = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped: vi.fn(), setActive });
    const folderDrag: DragData = { items: [item(null, true)], types: ["Files"] };
    const removedRow = target();
    const surface = target();

    zone.onDragEnter(dragEvent(folderDrag, removedRow));
    // A re-render detaches the row under the pointer, so Chromium never sends
    // its dragleave; the next element is entered directly.
    removedRow.isConnected = false;
    zone.onDragEnter(dragEvent(folderDrag, surface));
    zone.onDragLeave(dragEvent(folderDrag, surface));

    expect(setActive).toHaveBeenLastCalledWith(false);
  });

  it("stays open while the drag moves between elements", () => {
    const setActive = vi.fn();
    const zone = createRepositoryDropZone({ onFoldersDropped: vi.fn(), setActive });
    const folderDrag: DragData = { items: [item(null, true)], types: ["Files"] };
    const first = target();
    const second = target();

    zone.onDragEnter(dragEvent(folderDrag, first));
    zone.onDragEnter(dragEvent(folderDrag, second));
    zone.onDragLeave(dragEvent(folderDrag, first));

    expect(setActive).toHaveBeenLastCalledWith(true);

    zone.onDragLeave(dragEvent(folderDrag, second));

    expect(setActive).toHaveBeenLastCalledWith(false);
  });
});
