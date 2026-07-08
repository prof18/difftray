type SyntaxTokenKind = "comment" | "keyword" | "number" | "plain" | "string";

type SyntaxToken = {
  readonly kind: SyntaxTokenKind;
  readonly text: string;
};

type TextRange = {
  readonly end: number;
  readonly start: number;
};

export function CodeLine({
  changedRanges = [],
  highlight,
  path,
  text
}: {
  readonly changedRanges?: readonly TextRange[] | undefined;
  readonly highlight: boolean;
  readonly path: string;
  readonly text: string;
}): React.JSX.Element {
  const segments = splitLineSegments(text, changedRanges);

  return (
    <code>
      {segments.map((segment, segmentIndex) => {
        const tokens = highlight
          ? tokenizeCodeLine({ path, text: segment.text })
          : [{ kind: "plain" as const, text: segment.text }];
        const children = tokens.map((token, tokenIndex) =>
          token.kind === "plain" ? (
            token.text
          ) : (
            <span
              className="diff-surface__syntax-token"
              data-token-kind={token.kind}
              key={`${segmentIndex.toString()}:${token.kind}:${tokenIndex.toString()}`}
            >
              {token.text}
            </span>
          )
        );

        return segment.changed ? (
          <span
            className="diff-surface__line-change"
            key={`change:${segmentIndex.toString()}`}
          >
            {children}
          </span>
        ) : (
          <span key={`plain:${segmentIndex.toString()}`}>{children}</span>
        );
      })}
    </code>
  );
}

export function tokenizeCodeLine({
  path,
  text
}: {
  readonly path: string;
  readonly text: string;
}): readonly SyntaxToken[] {
  if (!supportsSyntaxTokens(path)) {
    return [{ kind: "plain", text }];
  }

  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith("//", index)) {
      tokens.push({ kind: "comment", text: text.slice(index) });
      break;
    }

    const char = text[index];

    if (char === '"' || char === "'" || char === "`") {
      const end = consumeQuotedString(text, index, char);
      tokens.push({ kind: "string", text: text.slice(index, end) });
      index = end;
      continue;
    }

    if (isDigit(char)) {
      const end = consumeNumber(text, index);
      tokens.push({ kind: "number", text: text.slice(index, end) });
      index = end;
      continue;
    }

    if (isIdentifierStart(char)) {
      const end = consumeIdentifier(text, index);
      const word = text.slice(index, end);
      tokens.push({
        kind: syntaxKeywords.has(word) ? "keyword" : "plain",
        text: word
      });
      index = end;
      continue;
    }

    const end = consumePlain(text, index);
    tokens.push({ kind: "plain", text: text.slice(index, end) });
    index = end;
  }

  return mergeAdjacentPlainTokens(tokens);
}

function consumeQuotedString(text: string, start: number, quote: string): number {
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }

    if (text[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return text.length;
}

function consumeNumber(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length && /[\d._a-fA-Fxob]/.test(text[index] ?? "")) {
    index += 1;
  }

  return index;
}

function consumeIdentifier(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length && isIdentifierPart(text[index] ?? "")) {
    index += 1;
  }

  return index;
}

function consumePlain(text: string, start: number): number {
  let index = start + 1;

  while (index < text.length) {
    const char = text[index];

    if (
      text.startsWith("//", index) ||
      char === '"' ||
      char === "'" ||
      char === "`" ||
      isDigit(char) ||
      isIdentifierStart(char)
    ) {
      break;
    }

    index += 1;
  }

  return index;
}

function mergeAdjacentPlainTokens(
  tokens: readonly SyntaxToken[]
): readonly SyntaxToken[] {
  const merged: SyntaxToken[] = [];

  for (const token of tokens) {
    const previous = merged.at(-1);

    if (token.kind === "plain" && previous?.kind === "plain") {
      merged[merged.length - 1] = {
        kind: "plain",
        text: `${previous.text}${token.text}`
      };
      continue;
    }

    merged.push(token);
  }

  return merged;
}

function supportsSyntaxTokens(path: string): boolean {
  return /\.(?:cjs|cts|js|jsx|json|kts?|mjs|mts|ts|tsx)$/i.test(path);
}

function splitLineSegments(
  text: string,
  changedRanges: readonly TextRange[]
): ReadonlyArray<{ readonly changed: boolean; readonly text: string }> {
  if (changedRanges.length === 0) {
    return [{ changed: false, text }];
  }

  const segments: Array<{ readonly changed: boolean; readonly text: string }> = [];
  let cursor = 0;

  for (const range of changedRanges) {
    const start = Math.max(0, Math.min(text.length, range.start));
    const end = Math.max(start, Math.min(text.length, range.end));

    if (cursor < start) {
      segments.push({ changed: false, text: text.slice(cursor, start) });
    }

    if (start < end) {
      segments.push({ changed: true, text: text.slice(start, end) });
    }

    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ changed: false, text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ changed: false, text }];
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && /\d/.test(char);
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[$A-Z_a-z]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[$\w]/.test(char);
}

const syntaxKeywords = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "else",
  "export",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "public",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "val",
  "var",
  "void",
  "when",
  "while"
]);
