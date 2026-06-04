export type NameStatusDiff = {
  readonly newMode?: string;
  readonly newObjectId?: string;
  readonly newPath: string;
  readonly oldMode?: string;
  readonly oldObjectId?: string;
  readonly oldPath?: string;
  readonly status: "added" | "deleted" | "modified" | "renamed";
};

export type DiffStat = {
  readonly additions: number;
  readonly deletions: number;
};

export function parseRawDiffs(output: string): readonly NameStatusDiff[] {
  const records = output.split("\0").filter((record) => record.length > 0);
  const diffs: NameStatusDiff[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const header = records[index];

    if (!header) {
      continue;
    }

    if (!header.startsWith(":")) {
      throw new Error(`Malformed Git raw diff record: ${header}`);
    }

    const [oldMode, newMode, oldObjectId, newObjectId, rawStatus] = header
      .slice(1)
      .split(" ");
    const statusCode = rawStatus?.[0] ?? "M";

    if (statusCode === "R") {
      const oldPath = records[index + 1];
      const newPath = records[index + 2];

      if (!oldPath || !newPath) {
        throw new Error("Git rename diff is missing a path.");
      }

      diffs.push({
        ...(newMode ? { newMode } : {}),
        ...(newObjectId ? { newObjectId } : {}),
        newPath,
        ...(oldMode ? { oldMode } : {}),
        ...(oldObjectId ? { oldObjectId } : {}),
        oldPath,
        status: "renamed"
      });
      index += 2;
      continue;
    }

    const pathRecord = records[index + 1];

    if (!pathRecord) {
      continue;
    }

    diffs.push({
      ...(newMode ? { newMode } : {}),
      ...(newObjectId ? { newObjectId } : {}),
      newPath: pathRecord,
      ...(oldMode ? { oldMode } : {}),
      ...(oldObjectId ? { oldObjectId } : {}),
      status: statusFromRawStatusCode(statusCode)
    });
    index += 1;
  }

  return diffs;
}

export function parseDiffStats(output: string): ReadonlyMap<string, DiffStat> {
  const stats = new Map<string, DiffStat>();

  for (const line of output.split("\n")) {
    if (line.length === 0) {
      continue;
    }

    const [rawAdditions, rawDeletions, ...pathParts] = line.split("\t");
    const filePath = normalizeNumstatPath(pathParts.join("\t"));

    if (!rawAdditions || !rawDeletions || filePath.length === 0) {
      continue;
    }

    stats.set(filePath, {
      additions: numberStat(rawAdditions),
      deletions: numberStat(rawDeletions)
    });
  }

  return stats;
}

export function normalizeNumstatPath(filePath: string): string {
  const braceRename = /^(?<prefix>.*)\{.* => (?<next>.*)\}(?<suffix>.*)$/.exec(filePath);

  if (braceRename?.groups?.next !== undefined) {
    return `${braceRename.groups.prefix ?? ""}${braceRename.groups.next}${braceRename.groups.suffix ?? ""}`;
  }

  const plainRename = /^.* => (?<next>.*)$/.exec(filePath);

  return plainRename?.groups?.next ?? filePath;
}

function statusFromRawStatusCode(code: string): NameStatusDiff["status"] {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "M":
    default:
      return "modified";
  }
}

function numberStat(value: string): number {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
