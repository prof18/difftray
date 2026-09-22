export const MAX_PREVIEW_LINES = 1_000;
export const MAX_PREVIEW_BYTES = 128 * 1_024;

/**
 * Produces a complete source snapshot only when the requested range fits the
 * preview renderer's line and UTF-8 byte budgets. It deliberately never
 * truncates a range because the resulting preview must describe all selected
 * lines.
 */
export function createPreviewSnapshot(
  source: readonly string[],
  lineStart: number,
  lineEnd: number
): string | undefined {
  const lineCount = lineEnd - lineStart + 1;
  if (
    lineStart < 1 ||
    lineEnd < lineStart ||
    lineEnd > source.length ||
    lineCount > MAX_PREVIEW_LINES
  ) {
    return undefined;
  }

  let byteLength = 0;
  for (let index = lineStart - 1; index < lineEnd; index += 1) {
    const line = source[index];
    if (line === undefined) return undefined;
    const textEnd = withoutTerminalNewline(line);
    byteLength += utf8ByteLength(line, textEnd);
    if (index > lineStart - 1) byteLength += 1;
    if (byteLength > MAX_PREVIEW_BYTES) return undefined;
  }

  const lines: string[] = [];
  for (let index = lineStart - 1; index < lineEnd; index += 1) {
    const line = source[index];
    if (line === undefined) return undefined;
    lines.push(line.slice(0, withoutTerminalNewline(line)));
  }
  return lines.join("\n");
}

function withoutTerminalNewline(line: string): number {
  if (!line.endsWith("\n")) return line.length;
  return line.endsWith("\r\n") ? line.length - 2 : line.length - 1;
}

function utf8ByteLength(text: string, end: number): number {
  let length = 0;
  for (let index = 0; index < end; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x7f) {
      length += 1;
    } else if (code <= 0x7ff) {
      length += 2;
    } else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < end &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      length += 4;
      index += 1;
    } else {
      length += 3;
    }
  }
  return length;
}
