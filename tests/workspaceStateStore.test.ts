import { beforeEach, describe, expect, test } from "bun:test";
import {
  WorkspaceStateStore,
  normalizeWorkspaceMetadata,
  safeRelativeWorkspacePath,
  workspaceRestoreCandidates
} from "../src/workspace/workspaceStateStore";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  },
  configurable: true
});

describe("workspace state store", () => {
  beforeEach(() => values.clear());

  test("normalizes portable project and session metadata", () => {
    expect(normalizeWorkspaceMetadata({
      project: { projectId: "project-1", mainFile: "chapters/main.typ" },
      workspace: {
        activeFile: "chapters/one.typ",
        openTabs: [{ path: "chapters/one.typ", selectionAnchor: 4, selectionHead: 5 }],
        expandedDirectories: ["chapters"],
        layout: { inputContainerWidthPct: 60, explorerSidebarWidthPx: 300, sidebarVisible: false }
      }
    })).toEqual({
      project: {
        schemaVersion: 1,
        projectId: "project-1",
        mainFile: "chapters/main.typ",
        recommendedToolchain: null
      },
      workspace: {
        schemaVersion: 1,
        activeFile: "chapters/one.typ",
        openTabs: [{
          path: "chapters/one.typ",
          selectionAnchor: 4,
          selectionHead: 5,
          scrollTop: undefined,
          scrollLeft: undefined,
          foldRanges: null
        }],
        expandedDirectories: ["chapters"],
        layout: { inputContainerWidthPct: 60, explorerSidebarWidthPx: 300, sidebarVisible: false },
        selectedToolchain: null
      }
    });
  });

  test("rejects absolute and traversing metadata paths", () => {
    expect(safeRelativeWorkspacePath("chapters/main.typ")).toBe("chapters/main.typ");
    expect(safeRelativeWorkspacePath("C:\\project\\main.typ")).toBeNull();
    expect(safeRelativeWorkspacePath("../main.typ")).toBeNull();
    expect(safeRelativeWorkspacePath("/project/main.typ")).toBeNull();
  });

  test("restores active and main files without duplicate candidates", () => {
    const metadata = normalizeWorkspaceMetadata({
      project: { projectId: "project-1", mainFile: "main.typ" },
      workspace: { activeFile: "main.typ", openTabs: [{ path: "chapter.typ" }] }
    });
    expect(workspaceRestoreCandidates(metadata)).toEqual(["main.typ", "chapter.typ"]);
  });

  test("reads and removes legacy absolute-path state for one-time migration", () => {
    values.set("typsastra-workspace-C:/work", JSON.stringify({
      activeFilePath: "C:/work/main.typ",
      pinnedMainFilePath: "C:/work/main.typ",
      openTabs: []
    }));
    const store = new WorkspaceStateStore();
    expect(store.loadLegacy("C:/work")?.pinnedMainFilePath).toBe("C:/work/main.typ");
    store.removeLegacy("C:/work");
    expect(store.loadLegacy("C:/work")).toBeNull();
  });
});
