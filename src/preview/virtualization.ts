export function pagesToEvict(
  renderedPages: readonly number[],
  focusPage: number,
  maximumResidentPages: number
): number[] {
  if (maximumResidentPages < 1) return [...renderedPages];
  const excess = renderedPages.length - maximumResidentPages;
  if (excess <= 0) return [];
  return [...renderedPages]
    .sort((left, right) =>
      Math.abs(right - focusPage) - Math.abs(left - focusPage)
      || right - left
    )
    .slice(0, excess);
}

export function pageDimensionsChanged(
  previous: { width: number; height: number } | undefined,
  next: { width: number; height: number },
  tolerance = 0.01
): boolean {
  return !previous
    || Math.abs(previous.width - next.width) > tolerance
    || Math.abs(previous.height - next.height) > tolerance;
}
