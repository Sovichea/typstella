import { describe, expect, test } from "bun:test";
import { isHiddenWorkspaceEntry, sortFileNodes, type FileNode } from "../src/components/explorer";
import { explorerKeyboardAction } from "../src/components/contextMenuController";

describe("workspace explorer", () => {
  test("sorts folders before files without mutating the source list", () => {
    const nodes: FileNode[] = [
      { name: "z.typ", path: "/z.typ", isDirectory: false },
      { name: "assets", path: "/assets", isDirectory: true },
      { name: "a.typ", path: "/a.typ", isDirectory: false }
    ];

    expect(sortFileNodes(nodes).map(node => node.name)).toEqual(["assets", "a.typ", "z.typ"]);
    expect(nodes.map(node => node.name)).toEqual(["z.typ", "assets", "a.typ"]);
  });

  test("maps standard explorer file-operation shortcuts", () => {
    const event = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...modifiers
    }) as KeyboardEvent;

    expect(explorerKeyboardAction(event("c", { ctrlKey: true }))).toBe("copy");
    expect(explorerKeyboardAction(event("V", { ctrlKey: true }))).toBe("paste");
    expect(explorerKeyboardAction(event("Delete"))).toBe("delete");
    expect(explorerKeyboardAction(event("c"))).toBeNull();
    expect(explorerKeyboardAction(event("Delete", { shiftKey: true }))).toBeNull();
  });

  test("hides Typsastra's managed workspace cache directory", () => {
    expect(isHiddenWorkspaceEntry(".typsastra")).toBe(true);
    expect(isHiddenWorkspaceEntry(".typstella")).toBe(true);
    expect(isHiddenWorkspaceEntry(".typst")).toBe(false);
    expect(isHiddenWorkspaceEntry("typsastra")).toBe(false);
  });
});
