export function slugify(value: string, fallback = "problem"): string {
  const slug = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");

  return slug || fallback;
}

export function padProblemIndex(index: number | undefined): string {
  if (index === undefined || Number.isNaN(index)) {
    return "000";
  }
  return String(index).padStart(3, "0");
}
