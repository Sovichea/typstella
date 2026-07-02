import { describe, expect, test } from "bun:test";
import { Text } from "@codemirror/state";
import { PreviewSyncController } from "../src/preview/previewSyncController";

describe("preview inverse sync", () => {
  test("maps generated lib.typ text to the nearest active CodeMirror occurrence", () => {
    const source = "ខ្យង នៅទីនេះ ហើយខ្យង នៅទីនោះ";
    const second = source.lastIndexOf("ខ្យង");
    const editor = {
      state: {
        doc: Text.of([source]),
        selection: { main: { head: second } }
      }
    };
    const controller = new PreviewSyncController({
      getEditor: () => editor as never,
      getClient: () => undefined,
      getActiveFilePath: () => "main.typ",
      getPreviewRootPath: () => "main.typ",
      getPreviewTaskId: () => "task",
      isReady: () => true,
      isEnabled: () => true
    });

    controller.recordTextClick({ text: "ខ្យង", offset: 1 });
    expect(controller.mapGeneratedInversePosition()).toBe(second + 1);
    expect(controller.mapGeneratedInversePosition()).toBeUndefined();
  });
});
