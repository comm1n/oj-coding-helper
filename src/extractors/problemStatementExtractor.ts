import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { ProblemSample, ProblemStatementScanResult } from "../types.js";
import {
  normalizeInlineText,
  normalizeSampleText,
  normalizeText,
  parseOptionalInteger
} from "../utils/normalizeText.js";
import { extractProblemId } from "../utils/url.js";

type CheerioNode = Parameters<CheerioAPI>[0];
type SectionKey =
  | "description"
  | "inputDescription"
  | "outputDescription"
  | "sampleInput"
  | "sampleOutput"
  | "hint";

interface SectionHit {
  key: SectionKey;
  sample: boolean;
}

interface ExtractedSections {
  description: string[];
  inputDescription: string[];
  outputDescription: string[];
  sampleInputs: string[];
  sampleOutputs: string[];
  hint: string[];
}

const sectionPatterns: Array<{ key: SectionKey; sample: boolean; patterns: RegExp[] }> = [
  {
    key: "sampleInput",
    sample: true,
    patterns: [/^输入样例\s*\d*$/i, /^样例输入\s*\d*$/i, /^sample\s*input\s*\d*$/i]
  },
  {
    key: "sampleOutput",
    sample: true,
    patterns: [/^输出样例\s*\d*$/i, /^样例输出\s*\d*$/i, /^sample\s*output\s*\d*$/i]
  },
  {
    key: "description",
    sample: false,
    patterns: [/^描述$/i, /^题目描述$/i, /^description$/i]
  },
  {
    key: "inputDescription",
    sample: false,
    patterns: [/^输入$/i, /^输入描述$/i, /^input$/i]
  },
  {
    key: "outputDescription",
    sample: false,
    patterns: [/^输出$/i, /^输出描述$/i, /^output$/i]
  },
  {
    key: "hint",
    sample: false,
    patterns: [/^提示$/i, /^说明$/i, /^hint$/i, /^note$/i]
  }
];

export function extractProblemStatement(
  html: string,
  options: { sourceUrl?: string } = {}
): ProblemStatementScanResult {
  const $ = cheerio.load(html);
  const content = $("#problem-content");
  if (content.length === 0) {
    throw new Error("This page does not contain #problem-content.");
  }

  const title = extractProblemTitle($);
  const info = extractProblemInfo($);
  const sections = extractSections($, content);
  const samples = buildSamples(sections.sampleInputs, sections.sampleOutputs);
  const sourceProblemId = extractProblemId(options.sourceUrl);
  const submitAvailable = hasSubmitButton($);

  const result: ProblemStatementScanResult = {
    pageKind: "problem-statement",
    title,
    description: normalizeText(sections.description.join("\n\n")),
    inputDescription: normalizeText(sections.inputDescription.join("\n\n")),
    outputDescription: normalizeText(sections.outputDescription.join("\n\n")),
    samples
  };

  const problemId = info.problemId || sourceProblemId;
  if (info.contestTitle) result.contestTitle = info.contestTitle;
  if (info.problemIndex !== undefined) result.problemIndex = info.problemIndex;
  if (problemId) result.problemId = problemId;
  if (info.timeLimit) result.timeLimit = info.timeLimit;
  if (info.memoryLimit) result.memoryLimit = info.memoryLimit;
  if (info.author) result.author = info.author;
  const hint = normalizeText(sections.hint.join("\n\n"));
  if (hint) result.hint = hint;
  if (options.sourceUrl) result.sourceUrl = options.sourceUrl;
  result.submitAvailable = submitAvailable;

  if (!result.description && !result.inputDescription && !result.outputDescription) {
    throw new Error("This page does not contain recognizable problem statement sections.");
  }

  return result;
}

function extractProblemTitle($: CheerioAPI): string {
  const contentTitle = normalizeInlineText(
    $("#problem-content").find("h1, h2, .problem-title, .title").first().text()
  );
  if (contentTitle && !isSectionHeading(contentTitle)) {
    return contentTitle;
  }

  const heading = normalizeInlineText($("h1, h2, .problem-title").first().text());
  if (heading && !isSectionHeading(heading)) {
    return heading;
  }

  const title = normalizeInlineText($("title").text()).replace(/^BJFUOJ\s*\|\s*/i, "");
  if (title) {
    return title;
  }

  throw new Error("This problem page does not contain a recognizable title.");
}

function extractProblemInfo($: CheerioAPI): {
  contestTitle?: string;
  problemIndex?: number;
  problemId?: string;
  timeLimit?: string;
  memoryLimit?: string;
  author?: string;
} {
  const infoRoot = $("#info");
  const infoText = infoRoot.length ? extractReadableText($, infoRoot) : extractReadableText($, $("body"));
  const result: {
    contestTitle?: string;
    problemIndex?: number;
    problemId?: string;
    timeLimit?: string;
    memoryLimit?: string;
    author?: string;
  } = {};

  const id = matchInfo(infoText, [/^(?:ID|题目ID|Problem\s*ID)$/i]);
  const timeLimit = matchInfo(infoText, [/^(?:Time\s*Limit|时间限制)$/i]);
  const memoryLimit = matchInfo(infoText, [/^(?:Memory\s*Limit|内存限制)$/i]);
  const author = matchInfo(infoText, [/^(?:Author|出题人|命题人)$/i]);
  const contestTitle = matchInfo(infoText, [/^(?:Contest|比赛|练习)$/i]);
  const problemIndex = matchInfo(infoText, [/^(?:#|Index|题号)$/i]);

  if (id) result.problemId = id;
  if (timeLimit) result.timeLimit = normalizeInlineText(timeLimit).replace(/\s+/g, "");
  if (memoryLimit) result.memoryLimit = normalizeInlineText(memoryLimit).replace(/\s+/g, "");
  if (author) result.author = author;
  if (contestTitle) result.contestTitle = contestTitle;
  const parsedIndex = parseOptionalInteger(problemIndex);
  if (parsedIndex !== undefined) result.problemIndex = parsedIndex;

  if (!result.problemId) {
    const inlineId = infoText.match(/\bID[:：]?\s*([A-Za-z0-9_-]+)/i);
    if (inlineId?.[1]) result.problemId = inlineId[1];
  }
  if (!result.timeLimit) {
    const inlineTime = infoText.match(/(?:Time\s*Limit|时间限制)[:：]?\s*([0-9]+\s*(?:MS|S|ms|s))/i);
    if (inlineTime?.[1]) result.timeLimit = inlineTime[1].replace(/\s+/g, "").toUpperCase();
  }
  if (!result.memoryLimit) {
    const inlineMemory = infoText.match(/(?:Memory\s*Limit|内存限制)[:：]?\s*([0-9]+\s*(?:MB|KB|GB|mb|kb|gb))/i);
    if (inlineMemory?.[1]) result.memoryLimit = inlineMemory[1].replace(/\s+/g, "").toUpperCase();
  }

  return result;
}

function matchInfo(text: string, labels: RegExp[]): string | undefined {
  const lines = text
    .split("\n")
    .map((line) => normalizeInlineText(line))
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const label of labels) {
      if (label.test(line)) {
        const sameLine = line.replace(label, "").replace(/^[:：]\s*/, "").trim();
        if (sameLine) {
          return sameLine;
        }
        return lines[index + 1];
      }

      const colonMatch = line.match(/^(.+?)[:：]\s*(.+)$/);
      if (colonMatch?.[1] && colonMatch[2] && label.test(colonMatch[1].trim())) {
        return colonMatch[2].trim();
      }
    }
  }

  return undefined;
}

function extractSections($: CheerioAPI, content: CheerioNode): ExtractedSections {
  const sections: ExtractedSections = {
    description: [],
    inputDescription: [],
    outputDescription: [],
    sampleInputs: [],
    sampleOutputs: [],
    hint: []
  };

  if (extractBjfuojStructuredSections($, content, sections)) {
    return sections;
  }

  let current: SectionKey | undefined;

  for (const child of $(content).children().toArray()) {
    const hit = detectSectionFromElement($, child);
    if (hit) {
      current = hit.key;
      const payload = extractElementWithoutHeading($, child, hit.sample);
      appendSection(sections, hit.key, payload);
      continue;
    }

    if (!current) {
      continue;
    }

    const text =
      current === "sampleInput" || current === "sampleOutput"
        ? extractSampleText($, child)
        : extractReadableText($, child);
    appendSection(sections, current, text);
  }

  if (isEmptySections(sections)) {
    extractNestedSectionBlocks($, content, sections);
  }

  return sections;
}

function extractBjfuojStructuredSections(
  $: CheerioAPI,
  content: CheerioNode,
  sections: ExtractedSections
): boolean {
  let foundStructuredContent = false;
  const root = $(content);

  root.children("p.title").each((_, titleElement) => {
    const hit = detectSectionFromElement($, titleElement);
    if (!hit || hit.sample) {
      return;
    }

    const nodes = collectBjfuojSectionContentNodes($, titleElement);
    const text = nodes
      .map((node) => extractReadableText($, node))
      .filter(Boolean)
      .join("\n\n");

    appendSection(sections, hit.key, text);
    foundStructuredContent = true;
  });

  root.find(".sample").each((_, sampleElement) => {
    const sampleRoot = $(sampleElement);
    const inputRoot = sampleRoot.find(".sample-input").first();
    const outputRoot = sampleRoot.find(".sample-output").first();
    const input = inputRoot.length ? extractBjfuojSampleSideText($, inputRoot) : "";
    const output = outputRoot.length ? extractBjfuojSampleSideText($, outputRoot) : "";

    appendSection(sections, "sampleInput", input);
    appendSection(sections, "sampleOutput", output);
    foundStructuredContent = foundStructuredContent || Boolean(input || output);
  });

  return foundStructuredContent;
}

function collectBjfuojSectionContentNodes(
  $: CheerioAPI,
  titleElement: CheerioNode
): CheerioNode[] {
  const nodes: CheerioNode[] = [];

  for (const sibling of $(titleElement).nextAll().toArray()) {
    if (isBjfuojSectionBoundary($, sibling)) {
      break;
    }
    nodes.push(sibling);
  }

  return nodes;
}

function isBjfuojSectionBoundary($: CheerioAPI, element: CheerioNode): boolean {
  const node = $(element);
  return (
    node.is("p.title") ||
    node.hasClass("sample") ||
    node.find(".sample, .sample-input, .sample-output").length > 0
  );
}

function extractBjfuojSampleSideText($: CheerioAPI, element: CheerioNode): string {
  const clone = $(element).clone();
  clone.find(".title, .copy").remove();
  return extractSampleText($, clone);
}

function extractNestedSectionBlocks(
  $: CheerioAPI,
  content: CheerioNode,
  sections: ExtractedSections
): void {
  $(content)
    .find("section, .section, .problem-section, .content-box, .panel, .card, div")
    .each((_, element) => {
      const hit = detectSectionFromElement($, element);
      if (!hit) {
        return;
      }
      const payload = extractElementWithoutHeading($, element, hit.sample);
      appendSection(sections, hit.key, payload);
    });
}

function isEmptySections(sections: ExtractedSections): boolean {
  return (
    sections.description.length === 0 &&
    sections.inputDescription.length === 0 &&
    sections.outputDescription.length === 0 &&
    sections.sampleInputs.length === 0 &&
    sections.sampleOutputs.length === 0 &&
    sections.hint.length === 0
  );
}

function detectSectionFromElement($: CheerioAPI, element: CheerioNode): SectionHit | undefined {
  const candidates = [
    normalizeInlineText($(element).clone().children().remove().end().text()),
    normalizeInlineText($(element).children().first().text()),
    normalizeInlineText($(element).find("h2, h3, h4, strong, b, .section-title, .title").first().text())
  ].filter(Boolean);

  for (const candidate of candidates) {
    const hit = detectSection(candidate);
    if (hit) {
      return hit;
    }
  }

  return undefined;
}

function detectSection(text: string): SectionHit | undefined {
  for (const entry of sectionPatterns) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      return { key: entry.key, sample: entry.sample };
    }
  }
  return undefined;
}

function isSectionHeading(text: string): boolean {
  return detectSection(text) !== undefined;
}

function extractElementWithoutHeading(
  $: CheerioAPI,
  element: CheerioNode,
  sample: boolean
): string {
  const clone = $(element).clone();
  clone
    .find("h1, h2, h3, h4, strong, b, .section-title, .title")
    .filter((_, heading) => isSectionHeading(normalizeInlineText($(heading).text())))
    .remove();

  const direct = normalizeInlineText(clone.clone().children().remove().end().text());
  if (isSectionHeading(direct)) {
    clone.contents().first().remove();
  }

  return sample ? extractSampleText($, clone) : extractReadableText($, clone);
}

function extractReadableText($: CheerioAPI, element: CheerioNode): string {
  const clone = $(element).clone();
  clone.find("script, style").remove();
  clone.find("br").replaceWith("\n");
  clone.find("p, div, li, pre").append("\n");
  return normalizeText(clone.text());
}

function extractSampleText($: CheerioAPI, element: CheerioNode): string {
  const clone = $(element).clone();
  clone.find("script, style").remove();
  const preTexts = clone
    .find("pre")
    .toArray()
    .map((pre) => normalizeSampleText($(pre).text()))
    .filter(Boolean);
  if (preTexts.length > 0) {
    return preTexts.join("\n\n");
  }
  clone.find("br").replaceWith("\n");
  return normalizeSampleText(clone.text());
}

function appendSection(sections: ExtractedSections, key: SectionKey, value: string): void {
  if (!value) {
    return;
  }

  if (key === "sampleInput") {
    sections.sampleInputs.push(value);
  } else if (key === "sampleOutput") {
    sections.sampleOutputs.push(value);
  } else {
    sections[key].push(value);
  }
}

function buildSamples(inputs: string[], outputs: string[]): ProblemSample[] {
  const count = Math.max(inputs.length, outputs.length);
  const samples: ProblemSample[] = [];

  for (let index = 0; index < count; index += 1) {
    samples.push({
      index: index + 1,
      input: normalizeSampleText(inputs[index] ?? ""),
      output: normalizeSampleText(outputs[index] ?? "")
    });
  }

  return samples.filter((sample) => sample.input || sample.output);
}

function hasSubmitButton($: CheerioAPI): boolean {
  if ($("#submit-code").length === 0) {
    return false;
  }

  const submitRoot = $("#submit-code");
  const buttonText = normalizeInlineText(submitRoot.find("button, input[type='submit']").text());
  const submitInput = submitRoot.find("input[type='submit']").length > 0;
  return submitInput || /Submit|提交/i.test(buttonText);
}
