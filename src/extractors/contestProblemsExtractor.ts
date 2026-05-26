import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ContestProblem, ContestProblemsScanResult } from "../types.js";
import {
  normalizeInlineText,
  parseOptionalInteger
} from "../utils/normalizeText.js";
import { extractContestId, resolveMaybeUrl } from "../utils/url.js";

export function extractContestProblems(
  html: string,
  options: { baseUrl?: string } = {}
): ContestProblemsScanResult {
  const $ = cheerio.load(html);
  const table = findProblemTable($);
  if (!table) {
    throw new Error("This file does not look like a BJFUOJ contest problems page.");
  }

  const pageUrl = extractSavedFromUrl(html) ?? options.baseUrl;
  const contestId = extractContestId(pageUrl);
  const contestTitle = extractContestTitle($);
  const problems: ContestProblem[] = [];

  for (const row of $(table).find("tbody tr").toArray()) {
    const cells = $(row).find("td").toArray();
    if (cells.length < 2) {
      continue;
    }

    const index = parseOptionalInteger(normalizeInlineText($(cells[0]).text()));
    const titleCell = cells[1];
    const link = $(titleCell).find('a[href*="/problem/"]').first();
    const title =
      normalizeInlineText(link.text()) || normalizeInlineText($(titleCell).text());
    if (!index || !title) {
      continue;
    }

    const problem: ContestProblem = {
      index,
      title
    };
    const total = parseOptionalInteger(normalizeInlineText($(cells[2]).text()));
    const acRate = normalizeInlineText($(cells[3]).text());
    const url =
      resolveMaybeUrl(link.attr("href"), pageUrl) ??
      inferContestProblemUrl(pageUrl, contestId, index);

    if (total !== undefined) problem.total = total;
    if (acRate) problem.acRate = acRate;
    if (url) problem.url = url;

    problems.push(problem);
  }

  if (problems.length === 0) {
    throw new Error("This contest problems page does not contain any recognizable problems.");
  }

  return {
    pageKind: "contest-problems",
    ...(contestTitle ? { contestTitle } : {}),
    problems
  };
}

function extractSavedFromUrl(html: string): string | undefined {
  const match = html.match(/saved\s+from\s+url=\(\d+\)(https?:\/\/[^\s>]+)/i);
  return match?.[1];
}

function inferContestProblemUrl(
  pageUrl: string | undefined,
  contestId: string | undefined,
  problemIndex: number
): string | undefined {
  if (!pageUrl || !contestId) {
    return undefined;
  }

  try {
    const parsed = new URL(pageUrl);
    parsed.pathname = `/contest/${contestId}/problem/${problemIndex}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function findProblemTable($: CheerioAPI): ReturnType<CheerioAPI> | undefined {
  for (const table of $("table").toArray()) {
    const headers = $(table)
      .find("th")
      .toArray()
      .map((th) => normalizeInlineText($(th).text()).toLowerCase());
    if (
      headers.includes("#") &&
      headers.includes("title") &&
      (headers.includes("total") || headers.includes("ac rate"))
    ) {
      if ($(table).find("tbody tr").length > 0) {
        return $(table);
      }

      const ivuBodyTable = $(table).closest(".ivu-table").find(".ivu-table-body table").first();
      if (ivuBodyTable.find("tbody tr").length > 0) {
        return ivuBodyTable;
      }

      return $(table);
    }
  }
  return undefined;
}

function extractContestTitle($: CheerioAPI): string | undefined {
  const selectors = [
    "h1",
    "h2",
    ".contest-title",
    ".page-title",
    ".title",
    ".breadcrumb li:last-child",
    ".ant-breadcrumb-link:last-child"
  ];

  for (const selector of selectors) {
    const text = normalizeInlineText($(selector).first().text());
    if (text && !/^题目$|^Problems?$/i.test(text)) {
      return text;
    }
  }

  const title = normalizeInlineText($("title").text()).replace(/^BJFUOJ\s*\|\s*/i, "");
  if (title && !/Contest Problems?|Problem List/i.test(title)) {
    return title;
  }

  return undefined;
}

export function findProblemByIndexOrTitle(
  problems: ContestProblem[],
  options: { index?: number; title?: string }
): ContestProblem {
  if (options.index !== undefined) {
    const matched = problems.find((problem) => problem.index === options.index);
    if (!matched) {
      throw new Error(`No problem matched index: ${options.index}`);
    }
    return matched;
  }

  if (options.title) {
    const keyword = normalizeInlineText(options.title).toLowerCase();
    const matched = problems.find((problem) =>
      problem.title.toLowerCase().includes(keyword)
    );
    if (!matched) {
      throw new Error(`No problem matched title: ${options.title}`);
    }
    return matched;
  }

  throw new Error("Either problem index or problem title is required.");
}
