type SyntaxTokenKind = "comment" | "keyword" | "number" | "plain" | "string";

type SyntaxToken = {
  readonly kind: SyntaxTokenKind;
  readonly text: string;
};

export function CodeLine({
  path,
  text
}: {
  readonly path: string;
  readonly text: string;
}): React.JSX.Element {
  const tokens = tokenizeCodeLine({ path, text });

  return (
    <code>
      {tokens.map((token, index) =>
        token.kind === "plain" ? (
          token.text
        ) : (
          <span
            className="diff-surface__syntax-token"
            data-token-kind={token.kind}
            key={`${token.kind}:${String(index)}`}
          >
            {token.text}
          </span>
        )
      )}
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
