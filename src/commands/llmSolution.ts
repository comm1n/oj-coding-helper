import path from "node:path";
import type { ProblemStatement } from "../types.js";
import { loadConfig } from "../config.js";
import { log } from "../logger.js";
import { LlmService } from "../services/llmService.js";
import {
  resolveProblemDirFromJsonPath,
  saveSolutionDraft
} from "../services/solutionDraftService.js";
import { readJsonFile } from "../utils/safeJson.js";

export async function llmSolutionCommand(options: {
  from: string;
  outDir?: string;
  overwrite?: boolean;
}): Promise<void> {
  const fromPath = path.resolve(options.from);
  const raw = await readJsonFile<ProblemStatement | { problem: ProblemStatement }>(fromPath);
  const statement = "problem" in raw ? raw.problem : raw;
  validateProblemStatement(statement);

  const llm = new LlmService(loadConfig());
  const markdown = await llm.generateSolutionDraft(statement);
  console.log(markdown);

  if (!llm.enabled) {
    log("llm:solution", "LLM is disabled; no solution files were written");
    return;
  }

  const problemDir = options.outDir
    ? path.resolve(options.outDir)
    : resolveProblemDirFromJsonPath(fromPath, statement);
  const paths = await saveSolutionDraft(statement, markdown, {
    problemDir,
    overwrite: Boolean(options.overwrite)
  });

  console.log(JSON.stringify(paths, null, 2));
}

function validateProblemStatement(value: ProblemStatement): void {
  if (!value.title || !Array.isArray(value.samples)) {
    throw new Error("Input JSON is not a valid ProblemStatement.");
  }
}
