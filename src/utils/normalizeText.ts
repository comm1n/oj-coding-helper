export function normalizeText(input: string | undefined | null): string {
  if (!input) {
    return "";
  }

  return input
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeInlineText(input: string | undefined | null): string {
  return normalizeText(input).replace(/\n+/g, " ").trim();
}

export function normalizeSampleText(input: string | undefined | null): string {
  if (!input) {
    return "";
  }

  return input
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\n+|\n+$/g, "");
}

export function parseOptionalInteger(input: string | undefined): number | undefined {
  if (!input) {
    return undefined;
  }
  const matched = input.replace(/,/g, "").match(/\d+/);
  if (!matched) {
    return undefined;
  }
  return Number.parseInt(matched[0] ?? "", 10);
}
