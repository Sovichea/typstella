import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Text } from "@codemirror/state";

type Invocation = { command: string; resolve: (value: unknown) => void; reject: (error: unknown) => void };
const invocations: Invocation[] = [];

mock.module("@tauri-apps/api/core", () => ({
  invoke: (command: string) => new Promise((resolve, reject) => invocations.push({ command, resolve, reject }))
}));

const popup = () => ({
  className: "",
  classList: { add() {}, remove() {} },
  style: {},
  replaceChildren() {},
  appendChild() {}
});

const originalDocument = globalThis.document;
beforeAll(() => {
  Object.assign(globalThis, {
    document: {
      createElement: popup,
      body: { appendChild() {}, style: {} },
      documentElement: { style: {} }
    },
    window: Object.assign(globalThis, { innerWidth: 1200, innerHeight: 800 })
  });
});
afterAll(() => {
  Object.assign(globalThis, { document: originalDocument });
});

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const analysis = (text: string) => ({
  provider: "khmer",
  normalizedChanged: false,
  tokens: [{ text, from: 0, to: text.length, known: false, knownPrefix: false }]
});

async function controllerFor(text: string) {
  const state = { doc: Text.of([text]), selection: { main: { head: text.length } } };
  let replacementCount = 0;
  const editor = {
    state,
    dispatch(spec: { changes?: { from: number; to: number; insert: string } }) {
      if (!spec.changes) return;
      replacementCount++;
      const change = spec.changes;
      state.doc = Text.of([state.doc.sliceString(0, change.from) + change.insert + state.doc.sliceString(change.to)]);
    },
    focus() {},
    coordsAtPos() { return null; }
  };
  const { SpellcheckController } = await import("../src/editor/spellcheck");
  const controller = new SpellcheckController(() => editor as never);
  controller.activateDocument("a.typ");
  return { controller, state, get replacementCount() { return replacementCount; } };
}

async function startAnalysis(controller: { schedule(): void }): Promise<Invocation> {
  controller.schedule();
  await wait(180);
  const request = invocations.shift();
  if (!request) throw new Error("analysis request was not started");
  expect(request.command).toBe("analyze_text");
  return request;
}

describe("spellcheck request safety", () => {
  test("treats personal dictionary entries as known", async () => {
    const fixture = await controllerFor("ខុស");
    fixture.controller.setUserDictionary(["ខុស"]);
    const request = await startAnalysis(fixture.controller);
    request.resolve(analysis("ខុស"));
    await wait(0);
    expect(fixture.controller.issues).toEqual([]);
    fixture.controller.clear();
  });

  test("discards a response invalidated immediately by an edit", async () => {
    const fixture = await controllerFor("ខុស");
    const request = await startAnalysis(fixture.controller);
    fixture.state.doc = Text.of(["ខុសទៀត"]);
    fixture.controller.documentChanged();
    request.resolve(analysis("ខុស"));
    await wait(0);
    expect(fixture.controller.issues).toEqual([]);
    fixture.controller.clear();
  });

  test("discards a response after tab activation", async () => {
    const fixture = await controllerFor("ខុស");
    const request = await startAnalysis(fixture.controller);
    fixture.controller.activateDocument("b.typ");
    fixture.state.doc = Text.of(["ថ្មី"]);
    request.resolve(analysis("ខុស"));
    await wait(0);
    expect(fixture.controller.issues).toEqual([]);
  });

  test("discards a response after the active tab closes", async () => {
    const fixture = await controllerFor("ខុស");
    const request = await startAnalysis(fixture.controller);
    fixture.controller.activateDocument("");
    request.resolve(analysis("ខុស"));
    await wait(0);
    expect(fixture.controller.issues).toEqual([]);
  });

  test("uses half-open ranges and rejects replacement against a changed document", async () => {
    const fixture = await controllerFor("ខុស");
    const request = await startAnalysis(fixture.controller);
    request.resolve(analysis("ខុស"));
    await wait(0);
    const issue = fixture.controller.issues[0];
    expect(fixture.controller.issueAt(issue.to)).toBeNull();
    fixture.state.doc = Text.of(["ផ្សេង"]);
    fixture.controller.replace(issue, "ត្រូវ");
    expect(fixture.replacementCount).toBe(0);
    fixture.controller.clear();
  });

  test("discards a popup response after cursor movement", async () => {
    const fixture = await controllerFor("ខុស");
    const analyzeRequest = await startAnalysis(fixture.controller);
    analyzeRequest.resolve(analysis("ខុស"));
    await wait(0);
    const suggestions = fixture.controller.suggestions(fixture.controller.issues[0]);
    const popupRequest = invocations.shift();
    if (!popupRequest) throw new Error("suggestion request was not started");
    expect(popupRequest.command).toBe("spelling_suggestions");
    fixture.controller.selectionChanged();
    popupRequest.resolve(["ត្រូវ"]);
    expect(await suggestions).toEqual([]);
    fixture.controller.clear();
  });

  test("turns rejected native analysis into controlled state", async () => {
    const fixture = await controllerFor("ខុស");
    const request = await startAnalysis(fixture.controller);
    request.reject(new Error("offline"));
    await wait(0);
    expect(fixture.controller.issues).toEqual([]);
  });
});
