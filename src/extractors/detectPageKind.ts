import * as cheerio from "cheerio";
import type { PageKind } from "../types.js";
import { normalizeInlineText } from "../utils/normalizeText.js";

export function detectPageKind(html: string): PageKind {
  const $ = cheerio.load(html);
  const pageText = normalizeInlineText($("body").text());
  const title = normalizeInlineText($("title").text());

  if ($("#problem-content").length > 0) {
    return "problem-statement";
  }

  if ($("#contest-list").length > 0 || /Contest List/i.test(title)) {
    return "contest-index";
  }

  const problemTable = $("table").toArray().some((table) => {
    const headers = $(table)
      .find("th")
      .toArray()
      .map((th) => normalizeInlineText($(th).text()).toLowerCase());
    return (
      headers.includes("#") &&
      headers.includes("title") &&
      (headers.includes("total") || headers.includes("ac rate"))
    );
  });

  if (problemTable || /AC Rate/i.test(pageText)) {
    return "contest-problems";
  }

  return "unknown";
}
