export const fileListRowHeight = 54;
export const fileListOverscanRows = 8;

export type FileListVisibleWindow = {
  readonly endIndex: number;
  readonly startIndex: number;
  readonly visibleRowCount: number;
};

export function fileListVisibleWindow({
  fileCount,
  overscanRows = fileListOverscanRows,
  rowHeight = fileListRowHeight,
  scrollTop,
  viewportHeight
}: {
  readonly fileCount: number;
  readonly overscanRows?: number;
  readonly rowHeight?: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
}): FileListVisibleWindow {
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
  const visibleRowCount = Math.ceil(viewportHeight / rowHeight);
  const endIndex = Math.min(fileCount, startIndex + visibleRowCount + overscanRows * 2);

  return {
    endIndex,
    startIndex,
    visibleRowCount
  };
}

export function nextFileListScrollTopForSelection({
  clientHeight,
  currentScrollTop,
  rowHeight = fileListRowHeight,
  selectedIndex
}: {
  readonly clientHeight: number;
  readonly currentScrollTop: number;
  readonly rowHeight?: number;
  readonly selectedIndex: number;
}): number {
  if (selectedIndex < 0) {
    return currentScrollTop;
  }

  const rowTop = selectedIndex * rowHeight;
  const rowBottom = rowTop + rowHeight;
  const viewportBottom = currentScrollTop + clientHeight;

  if (rowTop < currentScrollTop) {
    return rowTop;
  }

  if (rowBottom > viewportBottom) {
    return Math.max(0, rowBottom - clientHeight);
  }

  return currentScrollTop;
}
