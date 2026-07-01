import { filePathKey } from "../platform/paths";

export type PreviewTarget = {
  rootPath: string | null;
  mainPath: string | null;
  imported: boolean;
  liveUpdates: boolean;
};

export type PreviewRefreshStyle = "on-type" | "on-save";

export function allowsLiveImportPreview(contents: string): boolean {
  const firstLine = contents.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  return firstLine === "// @allow-preview" || firstLine === "//@allow-preview";
}

export function previewRefreshStyle(target: PreviewTarget): PreviewRefreshStyle {
  return target.liveUpdates ? "on-type" : "on-save";
}

export function previewSessionIdentity(rootPath: string, style: PreviewRefreshStyle): { key: string; taskId: string } {
  const key = `${filePathKey(rootPath)}::${style}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return { key, taskId: `typstry-preview-${(hash >>> 0).toString(16)}` };
}
