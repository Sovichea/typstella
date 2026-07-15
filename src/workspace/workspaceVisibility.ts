export type WorkspaceViewportState = {
  showWelcome: boolean;
  showEditor: boolean;
  showWorkspaceChrome: boolean;
  showLoading: boolean;
};

export function workspaceViewportState(
  activeFilePath: string | null,
  workspaceRootPath: string | null,
  workspaceLoading = false
): WorkspaceViewportState {
  if (workspaceLoading) {
    return { showWelcome: false, showEditor: false, showWorkspaceChrome: false, showLoading: true };
  }
  return {
    showWelcome: activeFilePath === null && workspaceRootPath === null,
    showEditor: activeFilePath !== null,
    showWorkspaceChrome: workspaceRootPath !== null,
    showLoading: false
  };
}
