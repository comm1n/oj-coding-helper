import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProblemStatement } from "../types.js";
import { log } from "../logger.js";
import { ensureDir } from "../utils/safePath.js";
import { padProblemIndex, slugify } from "../utils/slugify.js";
import { shouldOmitMainFunction } from "../utils/submissionShape.js";

export interface SolutionDraftPaths {
  problemDir: string;
  markdownPath: string;
  solutionCppPath: string;
}

export interface SubmissionCodePath {
  problemDir: string;
  solutionCppPath: string;
}

export function resolveProblemDirFromJsonPath(jsonPath: string, statement: ProblemStatement): string {
  const dirname = path.dirname(path.resolve(jsonPath));
  if (path.basename(dirname) !== slugify(statement.title)) {
    return dirname;
  }

  const displayIndex = statement.problemIndex ?? parseNumericProblemId(statement.problemId);
  return path.join(path.dirname(dirname), `${padProblemIndex(displayIndex)}-${slugify(statement.title)}`);
}

export async function saveSolutionDraft(
  statement: ProblemStatement,
  markdown: string,
  options: { problemDir: string; overwrite?: boolean }
): Promise<SolutionDraftPaths> {
  const problemDir = path.resolve(options.problemDir);
  const markdownPath = path.join(problemDir, "llm-solution.md");
  const solutionCppPath = path.join(problemDir, "solution.cpp");
  await ensureDir(problemDir);

  await writeIfAllowed(markdownPath, renderSolutionMarkdown(statement, markdown), Boolean(options.overwrite));
  await writeIfAllowed(
    solutionCppPath,
    normalizeSubmissionCode(extractCppCode(markdown), {
      omitMain: shouldOmitMainFunction(statement)
    }),
    Boolean(options.overwrite)
  );

  log("llm:solution", `saved ${markdownPath}`);
  log("llm:solution", `saved ${solutionCppPath}`);

  return {
    problemDir,
    markdownPath,
    solutionCppPath
  };
}

export async function saveSubmissionCode(
  code: string,
  options: { problemDir: string; overwrite?: boolean; omitMain?: boolean }
): Promise<SubmissionCodePath> {
  const problemDir = path.resolve(options.problemDir);
  const solutionCppPath = path.join(problemDir, "solution.cpp");
  await ensureDir(problemDir);
  await writeIfAllowed(
    solutionCppPath,
    normalizeSubmissionCode(code, { omitMain: Boolean(options.omitMain) }),
    Boolean(options.overwrite)
  );
  log("llm:code", `saved ${solutionCppPath}`);
  return {
    problemDir,
    solutionCppPath
  };
}

export async function readSolutionCpp(problemDir: string): Promise<string> {
  const filePath = path.join(path.resolve(problemDir), "solution.cpp");
  return readFile(filePath, "utf8");
}

async function writeIfAllowed(filePath: string, content: string, overwrite: boolean): Promise<void> {
  const exists = await access(filePath)
    .then(() => true)
    .catch(() => false);

  if (exists && !overwrite) {
    throw new Error(`${filePath} already exists. Pass --overwrite to replace it.`);
  }

  await writeFile(filePath, content, "utf8");
}

function renderSolutionMarkdown(statement: ProblemStatement, markdown: string): string {
  return [
    `# LLM Solution Draft: ${statement.title}`,
    "",
    "> This draft is generated for local review and testing. The tool does not submit code automatically.",
    "",
    markdown.trim(),
    ""
  ].join("\n");
}

function extractCppCode(markdown: string): string {
  const block = markdown.match(/```(?:cpp|c\+\+|cc|cxx)\s*\n([\s\S]*?)```/i);
  if (block?.[1]) {
    return `${block[1].trim()}\n`;
  }

  return [
    "// No C++ code block was found in llm-solution.md.",
    "// Review the generated Markdown and copy the intended implementation here manually.",
    ""
  ].join("\n");
}

export function normalizeSubmissionCode(code: string, options: { omitMain?: boolean } = {}): string {
  const fenced = code.match(/```(?:cpp|c\+\+|cc|cxx)?\s*\n([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? code;
  const stripped = stripCppComments(raw);
  const normalized = options.omitMain ? removeMainFunction(stripped) : stripped;
  return `${normalized.trim()}\n`;
}

function stripCppComments(code: string): string {
  let result = "";
  let index = 0;
  let inString: '"' | "'" | "`" | undefined;
  let escaped = false;

  while (index < code.length) {
    const current = code[index] ?? "";
    const next = code[index + 1] ?? "";

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === inString) {
        inString = undefined;
      }
      index += 1;
      continue;
    }

    if (current === '"' || current === "'" || current === "`") {
      inString = current;
      result += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      index += 2;
      while (index < code.length && code[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < code.length && !(code[index] === "*" && code[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    result += current;
    index += 1;
  }

  return result
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function removeMainFunction(code: string): string {
  let result = code;
  let match = findMainFunction(result);

  while (match) {
    result = `${result.slice(0, match.start)}${result.slice(match.end)}`;
    match = findMainFunction(result);
  }

  return result.replace(/\n{3,}/g, "\n\n");
}

function findMainFunction(code: string): { start: number; end: number } | undefined {
  const mainPattern = /\b(?:int|signed|unsigned|auto|void|int32_t|int64_t|long\s+long)\s+main\s*\([^)]*\)\s*\{/g;
  const match = mainPattern.exec(code);
  if (!match) {
    return undefined;
  }

  const signatureStart = match.index;
  const lineStart = code.lastIndexOf("\n", signatureStart) + 1;
  const braceStart = code.indexOf("{", signatureStart);
  const braceEnd = findMatchingBrace(code, braceStart);
  if (braceEnd === undefined) {
    return undefined;
  }

  let end = braceEnd + 1;
  while (end < code.length && /[ \t\r\n]/.test(code[end] ?? "")) {
    end += 1;
  }

  return {
    start: lineStart,
    end
  };
}

function findMatchingBrace(code: string, braceStart: number): number | undefined {
  let depth = 0;
  let index = braceStart;
  let inString: '"' | "'" | undefined;
  let escaped = false;

  while (index < code.length) {
    const current = code[index] ?? "";

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === inString) {
        inString = undefined;
      }
      index += 1;
      continue;
    }

    if (current === '"' || current === "'") {
      inString = current;
      index += 1;
      continue;
    }

    if (current === "{") {
      depth += 1;
    } else if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return undefined;
}

function parseNumericProblemId(problemId: string | undefined): number | undefined {
  if (!problemId || !/^\d+$/.test(problemId)) {
    return undefined;
  }
  return Number.parseInt(problemId, 10);
}
