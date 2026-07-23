import { describe, expect, test } from "bun:test";
import {
  tinymistDataPlaneFrameConfirmsSourceMap,
  tinymistDataPlaneFrameKind,
  tinymistDataPlanePositionText
} from "../src/preview/tinymistDataPlane";

const bytes = (value: string) => new TextEncoder().encode(value).buffer;

describe("Tinymist preview data plane", () => {
  test("accepts binary jump frames", async () => {
    expect(await tinymistDataPlanePositionText(bytes("jump,3 56.69 98.25")))
      .toBe("jump,3 56.69 98.25");
  });

  test("ignores binary document frames", async () => {
    expect(await tinymistDataPlaneFrameKind(bytes("new,font and vector payload"))).toBe("document");
    expect(await tinymistDataPlaneFrameKind(bytes("diff-v1,binary payload"))).toBe("document");
    expect(await tinymistDataPlaneFrameKind(bytes("source-map-ready,"))).toBe("document");
    expect(await tinymistDataPlanePositionText(bytes("new,font and vector payload"))).toBeNull();
    expect(await tinymistDataPlanePositionText(bytes("diff-v1,binary payload"))).toBeNull();
    expect(await tinymistDataPlanePositionText(bytes("source-map-ready,"))).toBeNull();
  });

  test("classifies source-map and unknown frames without decoding document payloads", async () => {
    expect(await tinymistDataPlaneFrameKind(bytes("jump,3 56.69 98.25"))).toBe("position");
    expect(await tinymistDataPlaneFrameKind("viewport,2 10 20")).toBe("position");
    expect(await tinymistDataPlaneFrameKind(bytes("outline,payload"))).toBe("unknown");
  });

  test("accepts either a document update or resolved position as source-map readiness", () => {
    expect(tinymistDataPlaneFrameConfirmsSourceMap("document")).toBeTrue();
    expect(tinymistDataPlaneFrameConfirmsSourceMap("position")).toBeTrue();
    expect(tinymistDataPlaneFrameConfirmsSourceMap("unknown")).toBeFalse();
  });
});
