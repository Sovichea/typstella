import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && extname(entry.name).toLowerCase() === ".md" ? [path] : [];
  });
}

function localLinkTarget(rawTarget: string): string | null {
  const target = rawTarget.trim().replace(/^<|>$/g, "").split(/[?#]/, 1)[0];
  if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  return decodeURIComponent(target);
}

describe("documentation links", () => {
  test("all repository-local Markdown targets exist", async () => {
    const root = resolve(import.meta.dir, "..");
    const files = [resolve(root, "README.md"), ...markdownFiles(resolve(root, "docs"))];
    const missing: string[] = [];

    for (const file of files) {
      const markdown = await Bun.file(file).text();
      for (const match of markdown.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
        const target = localLinkTarget(match[1]);
        if (!target) continue;
        const absolute = resolve(dirname(file), target);
        if (!existsSync(absolute)) {
          missing.push(`${file.slice(root.length + 1)} -> ${match[1]}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});
