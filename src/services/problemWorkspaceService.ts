import { access, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProblemStatement, ProblemWorkspaceResult } from "../types.js";
import { log } from "../logger.js";
import { normalizeSampleText } from "../utils/normalizeText.js";
import { padProblemIndex, slugify } from "../utils/slugify.js";
import { ensureDir } from "../utils/safePath.js";
import { writeJsonFile } from "../utils/safeJson.js";
import { shouldOmitMainFunction } from "../utils/submissionShape.js";

export async function createProblemWorkspace(
  statement: ProblemStatement,
  options: { baseDir?: string } = {}
): Promise<ProblemWorkspaceResult> {
  const baseDir = options.baseDir ?? path.join("output", "problems");
  const displayIndex = statement.problemIndex ?? parseNumericProblemId(statement.problemId);
  const dirName = `${padProblemIndex(displayIndex)}-${slugify(statement.title)}`;
  const problemDir = path.join(baseDir, dirName);
  const samplesDir = path.join(problemDir, "samples");
  const scriptsDir = path.join(problemDir, "scripts");

  await ensureDir(samplesDir);
  await ensureDir(scriptsDir);

  const problemJsonPath = path.join(problemDir, "problem.json");
  const statementPath = path.join(problemDir, "statement.md");
  const mainCppPath = path.join(problemDir, "main.cpp");
  const notesPath = path.join(problemDir, "notes.md");
  const runScriptPath = path.join(scriptsDir, "run-samples.js");

  await writeJsonFile(problemJsonPath, statement);
  await writeFile(statementPath, renderStatementMarkdown(statement), "utf8");
  await writeFileIfAbsent(mainCppPath, renderCppTemplate(statement));
  await writeFileIfAbsent(notesPath, renderNotes(statement));
  await writeFileIfAbsent(runScriptPath, renderRunSamplesScript());

  for (const sample of statement.samples) {
    await writeFile(
      path.join(samplesDir, `sample${sample.index}.in`),
      `${normalizeSampleText(sample.input)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(samplesDir, `sample${sample.index}.out`),
      `${normalizeSampleText(sample.output)}\n`,
      "utf8"
    );
  }

  log("workspace", `created ${problemDir}`);

  return {
    problemDir,
    statementPath,
    mainCppPath,
    problemJsonPath
  };
}

function parseNumericProblemId(problemId: string | undefined): number | undefined {
  if (!problemId || !/^\d+$/.test(problemId)) {
    return undefined;
  }
  return Number.parseInt(problemId, 10);
}

export async function saveProblemJsonForInit(
  statement: ProblemStatement,
  options: { baseDir?: string; outPath?: string } = {}
): Promise<string> {
  const filePath =
    options.outPath ??
    path.join(options.baseDir ?? path.join("output", "problems"), slugify(statement.title), "problem.json");
  await writeJsonFile(filePath, statement);
  log("scan:problem", `saved ${filePath}`);
  return filePath;
}

async function writeFileIfAbsent(filePath: string, content: string): Promise<void> {
  const exists = await access(filePath)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    return;
  }
  await writeFile(filePath, content, "utf8");
}

function renderStatementMarkdown(statement: ProblemStatement): string {
  const lines = [
    `# ${statement.title}`,
    "",
    "## 题目信息",
    "",
    statement.contestTitle ? `- Contest: ${statement.contestTitle}` : undefined,
    statement.problemIndex !== undefined ? `- Index: ${statement.problemIndex}` : undefined,
    statement.problemId ? `- ID: ${statement.problemId}` : undefined,
    statement.timeLimit ? `- Time Limit: ${statement.timeLimit}` : undefined,
    statement.memoryLimit ? `- Memory Limit: ${statement.memoryLimit}` : undefined,
    statement.author ? `- Author: ${statement.author}` : undefined,
    statement.submitAvailable ? "- Submit button: detected on source page, not clicked" : undefined,
    "",
    "## 描述",
    "",
    statement.description || "_No description extracted._",
    "",
    "## 输入",
    "",
    statement.inputDescription || "_No input description extracted._",
    "",
    "## 输出",
    "",
    statement.outputDescription || "_No output description extracted._",
    "",
    ...statement.samples.flatMap((sample) => [
      `## 样例 ${sample.index}`,
      "",
      "### 输入",
      "",
      "```text",
      normalizeSampleText(sample.input),
      "```",
      "",
      "### 输出",
      "",
      "```text",
      normalizeSampleText(sample.output),
      "```",
      ""
    ]),
    statement.hint ? "## 提示" : undefined,
    statement.hint ? "" : undefined,
    statement.hint,
    statement.sourceUrl ? "## 来源" : undefined,
    statement.sourceUrl ? "" : undefined,
    statement.sourceUrl ? statement.sourceUrl : undefined,
    ""
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
}

function renderCppTemplate(statement: ProblemStatement): string {
  const noMainWarning = shouldOmitMainFunction(statement);

  const warning = noMainWarning
    ? [
        "// WARNING: The original problem appears to mention that submitted code should not include main().",
        "// This local template keeps main() only for sample testing. Adjust manually before any upload."
      ]
    : [
        "// Local practice template. This tool never submits code automatically.",
        "// Fill in the solution yourself, then run local samples before using the OJ manually."
      ];

  return `${warning.join("\n")}
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // TODO: Read input, implement your solution, and print the answer.
    return 0;
}
`;
}

function renderNotes(statement: ProblemStatement): string {
  return `# Notes for ${statement.title}

## 思路

- 

## 边界条件

- 

## 调试记录

- 
`;
}

function renderRunSamplesScript(): string {
  return `import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../../..");
const problemDir = path.resolve(__dirname, "..");

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(command, ["run", "run:samples", "--", "--problem-dir", problemDir], {
  cwd: projectRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
`;
}
