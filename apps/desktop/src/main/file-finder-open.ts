export type RevealProjectFileResult =
  | {
      readonly reason: "file_missing";
      readonly status: "rejected";
    }
  | {
      readonly status: "opened";
    };

export type RevealStoredProjectFileDependencies = {
  readonly findProject: (
    projectId: string
  ) => { readonly path: string } | null | undefined;
  readonly findReviewFile: (
    projectId: string,
    pathName: string
  ) => Promise<{ readonly path: string; readonly status: string } | undefined>;
  readonly resolveSafeFilePath: (
    projectPath: string,
    filePath: string
  ) => Promise<string | undefined>;
  readonly showItemInFolder: (absoluteFilePath: string) => void;
};

export async function revealStoredProjectFile(
  projectId: string,
  pathName: string,
  dependencies: RevealStoredProjectFileDependencies
): Promise<RevealProjectFileResult> {
  const project = dependencies.findProject(projectId);

  if (!project) {
    throw new Error(`Project is not stored: ${projectId}`);
  }

  const file = await dependencies.findReviewFile(projectId, pathName);

  if (!file || file.status === "deleted") {
    return {
      reason: "file_missing",
      status: "rejected"
    };
  }

  const absoluteFilePath = await dependencies.resolveSafeFilePath(
    project.path,
    file.path
  );

  if (!absoluteFilePath) {
    return {
      reason: "file_missing",
      status: "rejected"
    };
  }

  dependencies.showItemInFolder(absoluteFilePath);

  return { status: "opened" };
}
