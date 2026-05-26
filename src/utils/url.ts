export function resolveMaybeUrl(href: string | undefined, baseUrl?: string): string | undefined {
  if (!href) {
    return undefined;
  }

  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("javascript:")) {
    return undefined;
  }

  if (!baseUrl) {
    return trimmed;
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

export function extractContestId(url: string | undefined): string | undefined {
  return url?.match(/\/contest\/(\d+)/)?.[1];
}

export function extractProblemId(url: string | undefined): string | undefined {
  return url?.match(/\/problem\/([^/?#]+)/)?.[1];
}

export function toContestProblemsUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  const contestMatch = parsed.pathname.match(/^(\/contest\/\d+)(?:\/.*)?$/);
  if (contestMatch?.[1]) {
    parsed.pathname = `${contestMatch[1]}/problems`;
  }
  return parsed.toString();
}
