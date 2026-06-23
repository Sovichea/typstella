import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";

export interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[]; }

export class WorkspaceExplorer {
  constructor(private container: HTMLElement, private onFileSelected: (filePath: string) => void) {}

  public async loadWorkspace(rootPath: string) {
    this.container.innerHTML = `<div class="explorer-loading">Scanning Workspace...</div>`;
    try {
      const nodes = await this.readDirectoryRecursive(rootPath);
      this.container.innerHTML = "";
      
      const header = document.createElement("div");
      header.className = "explorer-header";
      header.textContent = "EXPLORER";
      this.container.appendChild(header);

      this.container.appendChild(this.renderTree(nodes));
    } catch {
      this.container.innerHTML = `<div class="explorer-error">Access Refused.</div>`;
    }
  }

  private async readDirectoryRecursive(dirPath: string): Promise<FileNode[]> {
    const entries: {name: string, isDirectory: boolean}[] = await invoke("read_workspace_dir", { path: dirPath });
    const nodes: FileNode[] = [];
    for (const entry of entries) {
      const childPath = await join(dirPath, entry.name);
      const node: FileNode = { name: entry.name, path: childPath, isDirectory: entry.isDirectory };
      if (entry.isDirectory) { node.children = await this.readDirectoryRecursive(childPath); }
      nodes.push(node);
    }
    return nodes.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }

  private renderTree(nodes: FileNode[], depth: number = 0): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const ul = document.createElement("ul");
    ul.className = "file-tree-branch";

    for (const node of nodes) {
      const li = document.createElement("li");
      li.className = node.isDirectory ? "tree-folder collapsed" : "tree-file";

      const label = document.createElement("div");
      label.className = "tree-item";
      // Base padding + depth padding
      label.style.paddingLeft = `${depth * 12 + 8}px`;

      const chevronContainer = document.createElement("span");
      chevronContainer.className = node.isDirectory ? "tree-chevron collapsed" : "tree-chevron-spacer";
      if (node.isDirectory) {
        // Down pointing chevron (default expanded, will be rotated -90deg by .collapsed)
        chevronContainer.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>`;
      }
      label.appendChild(chevronContainer);

      const iconContainer = document.createElement("span");
      iconContainer.className = "tree-icon";
      if (node.isDirectory) {
        // Folder icon
        iconContainer.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" color="#e8a838"><path d="M7 2l2 2h5v9H2V2h5zm0 1H3v9h10V5H8.5L6.5 3H7z"/></svg>`;
      } else {
        // File icon
        iconContainer.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" color="#519aba"><path d="M13.85 4.44l-3.28-3.3-.35-.14H2.5l-.5.5v13l.5.5h11l.5-.5V4.8l-.15-.36zM13 14H3V2h6.5v3.5h3.5V14zm-1.2-8.5H9V2.7l2.8 2.8z"/></svg>`;
      }
      label.appendChild(iconContainer);

      const textContainer = document.createElement("span");
      textContainer.className = "tree-text";
      textContainer.textContent = node.name;
      label.appendChild(textContainer);

      if (!node.isDirectory) {
        label.addEventListener("click", () => {
          document.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
          label.classList.add('selected');
          this.onFileSelected(node.path);
        });
      } else if (node.children) {
        const childBranch = this.renderTree(node.children, depth + 1);
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-children";
        childrenContainer.appendChild(childBranch);

        label.addEventListener("click", () => {
          li.classList.toggle("collapsed");
          if (li.classList.contains("collapsed")) {
            chevronContainer.classList.add('collapsed');
          } else {
            chevronContainer.classList.remove('collapsed');
          }
        });
        li.appendChild(childrenContainer);
      }

      li.insertBefore(label, li.firstChild);
      ul.appendChild(li);
    }
    fragment.appendChild(ul);
    return fragment;
  }
}
