import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ContestIndexScanResult, ContestSummary } from "../types.js";
import {
  normalizeInlineText,
  parseOptionalInteger
} from "../utils/normalizeText.js";
import { extractContestId, resolveMaybeUrl } from "../utils/url.js";

type CheerioNode = Parameters<CheerioAPI>[0];

export function extractContestIndex(
  html: string,
  options: { baseUrl?: string } = {}
): ContestIndexScanResult {
  const $ = cheerio.load(html);
  const title = normalizeInlineText($("title").text());
  const pageText = normalizeInlineText($("body").text());
  const root = $("#contest-list");

  if (root.length === 0 && !/Contest List/i.test(title) && !/All Contests/i.test(pageText)) {
    throw new Error("This file does not look like a BJFUOJ contest list page.");
  }

  const contests = extractFromTables($, root.length ? root : $("body"), options.baseUrl);
  if (contests.length === 0) {
    contests.push(...extractFromLinks($, root.length ? root : $("body"), options.baseUrl));
  }

  const unique = dedupeContests(contests);
  if (unique.length === 0) {
    throw new Error("This file does not contain any recognizable contest entries.");
  }

  return {
    pageKind: "contest-index",
    contests: unique
  };
}

function extractFromTables(
  $: CheerioAPI,
  root: CheerioNode,
  baseUrl: string | undefined
): ContestSummary[] {
  const rows = $(root).find("tbody tr").toArray();
  const contests: ContestSummary[] = [];

  for (const row of rows) {
    const cells = $(row).find("td").toArray();
    if (cells.length < 1) {
      continue;
    }

    const link = $(cells[0]).find('a[href*="/contest/"]').first();
    const title =
      normalizeInlineText(link.text()) || normalizeInlineText($(cells[0]).text());
    if (!title) {
      continue;
    }

    const url = resolveMaybeUrl(link.attr("href"), baseUrl);
    const summary: ContestSummary = { title };
    const id = extractContestId(url);
    const startTime = getCellText($, cells[1]);
    const duration = getCellText($, cells[2]);
    const rule = getCellText($, cells[3]);
    const status = getCellText($, cells[4]);

    if (id) summary.id = id;
    if (startTime) summary.startTime = startTime;
    if (duration) summary.duration = duration;
    if (rule) summary.rule = rule;
    if (status) summary.status = normalizeStatus(status);
    if (url) summary.url = url;

    contests.push(summary);
  }

  return contests;
}

function extractFromLinks(
  $: CheerioAPI,
  root: CheerioNode,
  baseUrl: string | undefined
): ContestSummary[] {
  const contests: ContestSummary[] = [];
  const anchors = $(root).find('a[href*="/contest/"]').toArray();

  for (const anchor of anchors) {
    const title = normalizeInlineText($(anchor).text());
    if (!title || /^#?$/.test(title)) {
      continue;
    }

    const url = resolveMaybeUrl($(anchor).attr("href"), baseUrl);
    const container = $(anchor).closest("li, tr, .contest, .contest-item, .item, .card, div");
    const containerText = normalizeInlineText(container.text());
    const summary: ContestSummary = { title };
    const id = extractContestId(url);

    const startTime = extractStartTime(containerText);
    const duration = extractDuration(containerText);
    const rule = extractRule(containerText);
    const status = extractStatus(containerText);

    if (id) summary.id = id;
    if (startTime) summary.startTime = startTime;
    if (duration) summary.duration = duration;
    if (rule) summary.rule = rule;
    if (status) summary.status = normalizeStatus(status);
    if (url) summary.url = url;

    contests.push(summary);
  }

  return contests;
}

function getCellText($: CheerioAPI, cell: CheerioNode | undefined): string | undefined {
  if (!cell) {
    return undefined;
  }
  const text = normalizeInlineText($(cell).text());
  return text || undefined;
}

function extractStartTime(text: string): string | undefined {
  const labeled = text.match(/(?:Start\s*Time|开始时间)[:：]?\s*([0-9]{4}[-/年]\s*\d{1,2}[-/月]\s*\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i);
  if (labeled?.[1]) {
    return normalizeInlineText(labeled[1].replace(/[年月]/g, "-").replace(/日/g, ""));
  }

  const date = text.match(/[0-9]{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
  return date?.[0];
}

function extractDuration(text: string): string | undefined {
  const labeled = text.match(/(?:Duration|持续时间)[:：]?\s*([^:：]+?)(?=\s+(?:Rule|Status|赛制|状态)\b|$)/i);
  if (labeled?.[1]) {
    return normalizeInlineText(labeled[1]);
  }

  const duration = text.match(/\b\d+\s*(?:days?|hours?|minutes?|秒|分钟|小时|天|周)\b/i);
  return duration?.[0];
}

function extractRule(text: string): string | undefined {
  const labeled = text.match(/(?:Rule|赛制)[:：]?\s*(ACM|OI|IOI|ICPC)/i);
  if (labeled?.[1]) {
    return labeled[1].toUpperCase();
  }
  const standalone = text.match(/\b(ACM|OI|IOI|ICPC)\b/i);
  return standalone?.[1]?.toUpperCase();
}

function extractStatus(text: string): string | undefined {
  const matched = text.match(/Underway|Ended|Not Started|进行中|已结束|未开始/i);
  return matched?.[0];
}

function normalizeStatus(status: string): string {
  const text = normalizeInlineText(status);
  if (/进行中|Underway/i.test(text)) return "Underway";
  if (/已结束|Ended/i.test(text)) return "Ended";
  if (/未开始|Not Started/i.test(text)) return "Not Started";
  return text;
}

function dedupeContests(contests: ContestSummary[]): ContestSummary[] {
  const seen = new Set<string>();
  const unique: ContestSummary[] = [];

  for (const contest of contests) {
    const key = contest.url || `${contest.title}:${contest.startTime ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(contest);
  }

  return unique;
}

export function findContestByKeyword(
  contests: ContestSummary[],
  keyword: string
): ContestSummary {
  const normalizedKeyword = normalizeInlineText(keyword).toLowerCase();
  const matched = contests.find((contest) =>
    contest.title.toLowerCase().includes(normalizedKeyword)
  );

  if (!matched) {
    throw new Error(`No contest matched keyword: ${keyword}`);
  }

  return matched;
}

export function countContestRows(html: string): number {
  const result = extractContestIndex(html);
  return parseOptionalInteger(String(result.contests.length)) ?? 0;
}
