export type GitFileStatus = "added" | "deleted" | "modified" | "renamed" | "untracked";

export type GitPorcelainStatus = {
  readonly indexStatus?: GitStatusCode;
  readonly path: string;
  readonly previousPath?: string;
  readonly status: GitFileStatus;
  readonly workingTreeStatus?: GitStatusCode;
};

export type GitStatusCode = "added" | "deleted" | "modified" | "renamed";

export function parseStatusPorcelainV2(output: string): readonly GitPorcelainStatus[] {
  const records = output.split("\0").filter((record) => record.length > 0);
  const statuses: GitPorcelainStatus[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];

    if (!record) {
      continue;
    }

    if (record.startsWith("? ")) {
      statuses.push({
        path: record.slice(2),
        status: "untracked"
      });
      continue;
    }

    if (record.startsWith("1 ")) {
      statuses.push(parseOrdinaryRecord(record));
      continue;
    }

    if (record.startsWith("2 ")) {
      const previousPath = records[index + 1];
      if (!previousPath) {
        throw new Error(`Git rename status record is missing previous path: ${record}`);
      }

      statuses.push(parseRenameRecord(record, previousPath));
      index += 1;
    }
  }

  return statuses;
}

export function shortBranchRefFromFullRef(ref: string): string | undefined {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/remotes/") && !ref.endsWith("/HEAD")) {
    return ref.slice("refs/remotes/".length);
  }

  return undefined;
}

function parseOrdinaryRecord(record: string): GitPorcelainStatus {
  const fields = splitStatusFields(record, 8);
  const xy = fields[1] ?? "..";
  const status = statusFromXY(xy);
  const indexStatus = statusCodeFromPorcelainCode(xy[0]);
  const workingTreeStatus = statusCodeFromPorcelainCode(xy[1]);

  return {
    ...(indexStatus ? { indexStatus } : {}),
    path: fields[8] ?? "",
    status,
    ...(workingTreeStatus ? { workingTreeStatus } : {})
  };
}

function parseRenameRecord(record: string, previousPath: string): GitPorcelainStatus {
  const fields = splitStatusFields(record, 9);
  const xy = fields[1] ?? "..";
  const indexStatus = statusCodeFromPorcelainCode(xy[0]);
  const workingTreeStatus = statusCodeFromPorcelainCode(xy[1]);

  return {
    ...(indexStatus ? { indexStatus } : {}),
    path: fields[9] ?? "",
    previousPath,
    status: "renamed",
    ...(workingTreeStatus ? { workingTreeStatus } : {})
  };
}

function splitStatusFields(record: string, spaceCount: number): readonly string[] {
  const fields: string[] = [];
  let start = 0;

  for (let spacesSeen = 0; spacesSeen < spaceCount; spacesSeen += 1) {
    const nextSpace = record.indexOf(" ", start);
    if (nextSpace === -1) {
      throw new Error(`Malformed Git porcelain-v2 status record: ${record}`);
    }

    fields.push(record.slice(start, nextSpace));
    start = nextSpace + 1;
  }

  fields.push(record.slice(start));
  return fields;
}

function statusFromXY(xy: string): GitFileStatus {
  if (xy.includes("A")) {
    return "added";
  }

  if (xy.includes("D")) {
    return "deleted";
  }

  if (xy.includes("R")) {
    return "renamed";
  }

  return "modified";
}

function statusCodeFromPorcelainCode(
  code: string | undefined
): GitStatusCode | undefined {
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "M":
      return "modified";
    case "R":
      return "renamed";
    default:
      return undefined;
  }
}
