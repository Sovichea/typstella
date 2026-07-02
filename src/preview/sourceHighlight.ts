export function findPreviewTextMatchInSourceLine(
  sourceLine: string,
  previewText: string,
  previewOffset: number
): { sourceOffset: number } | null {
  const text = previewText.replace(/\s+/g, " ");
  const offset = Math.max(0, Math.min(previewOffset, text.length));
  const sourceLineForSearch = sourceLine.replace(/\s+/g, " ");

  const direct = findPreviewSnippetInSourceLine(sourceLineForSearch, text, offset);
  if (direct) return direct;

  const before = text.slice(Math.max(0, offset - 24), offset).trimStart();
  const after = text.slice(offset, Math.min(text.length, offset + 48)).trimEnd();
  const around = `${before}${after}`;
  return findPreviewSnippetInSourceLine(sourceLineForSearch, around, Math.min(before.length, around.length));
}

export function findPreviewTextMatchesInSource(
  source: string,
  previewText: string,
  previewOffset: number
): number[] {
  const normalizedSource = normalizeTextWithOffsets(source);
  const normalizedPreview = normalizeTextWithOffsets(previewText);
  if (normalizedPreview.text.trim().length < 2) return [];

  const clickedOffset = normalizeTextWithOffsets(previewText.slice(0, Math.max(0, previewOffset))).text.length;
  const matches = findAll(normalizedSource.text, normalizedPreview.text);
  if (matches.length) {
    return matches.map(index => normalizedSource.offsets[Math.min(index + clickedOffset, normalizedSource.offsets.length - 1)]);
  }

  const contextFrom = Math.max(0, clickedOffset - 24);
  const contextTo = Math.min(normalizedPreview.text.length, clickedOffset + 48);
  const context = normalizedPreview.text.slice(contextFrom, contextTo).trim();
  if (context.length < 3) return [];
  const leadingTrim = normalizedPreview.text.slice(contextFrom, contextTo).length
    - normalizedPreview.text.slice(contextFrom, contextTo).trimStart().length;
  const contextClick = Math.max(0, clickedOffset - contextFrom - leadingTrim);
  return findAll(normalizedSource.text, context)
    .map(index => normalizedSource.offsets[Math.min(index + contextClick, normalizedSource.offsets.length - 1)]);
}

function normalizeTextWithOffsets(value: string): { text: string; offsets: number[] } {
  let text = "";
  const offsets: number[] = [];
  let sourceOffset = 0;
  let previousWasSpace = false;
  for (const character of value) {
    const width = character.length;
    if (character === "\u200b" || character === "\u200c" || character === "\u200d" || character === "\u00ad") {
      sourceOffset += width;
      continue;
    }
    if (/\s/u.test(character)) {
      if (!previousWasSpace) {
        text += " ";
        offsets.push(sourceOffset);
      }
      previousWasSpace = true;
      sourceOffset += width;
      continue;
    }
    previousWasSpace = false;
    text += character;
    for (let index = 0; index < width; index++) offsets.push(sourceOffset);
    sourceOffset += width;
  }
  offsets.push(sourceOffset);
  return { text, offsets };
}

function findAll(value: string, search: string): number[] {
  const matches: number[] = [];
  let from = 0;
  while (from <= value.length - search.length) {
    const index = value.indexOf(search, from);
    if (index < 0) break;
    matches.push(index);
    from = index + Math.max(1, search.length);
  }
  return matches;
}

function findPreviewSnippetInSourceLine(sourceLine: string, snippet: string, snippetOffset: number): { sourceOffset: number } | null {
  const trimmedSnippet = snippet.trim();
  if (trimmedSnippet.length < 2) return null;

  let index = sourceLine.indexOf(trimmedSnippet);
  if (index !== -1) {
    const leadingTrim = snippet.length - snippet.trimStart().length;
    return { sourceOffset: index + Math.max(0, snippetOffset - leadingTrim) };
  }

  for (let size = Math.min(32, trimmedSnippet.length); size >= 3; size--) {
    const start = Math.max(0, Math.min(snippetOffset, trimmedSnippet.length) - Math.floor(size / 2));
    const probe = trimmedSnippet.slice(start, start + size);
    if (probe.length < 3) continue;
    index = sourceLine.indexOf(probe);
    if (index !== -1) return { sourceOffset: index + Math.floor(probe.length / 2) };
  }

  return null;
}
