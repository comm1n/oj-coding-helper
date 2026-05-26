import path from "node:path";
import type { ProblemStatement } from "../types.js";
import { log } from "../logger.js";
import { readJsonFile } from "../utils/safeJson.js";
import { createProblemWorkspace } from "../services/problemWorkspaceService.js";

export async function initProblemCommand(options: { from: string }): Promise<void> {
  const filePath = path.resolve(options.from);
  const raw = await readJsonFile<ProblemStatement | { problem: ProblemStatement }>(filePath);
  const statement = "problem" in raw ? raw.problem : raw;
  validateProblemStatement(statement);

  const workspace = await createProblemWorkspace(statement);
  log("workspace", `initialized from ${filePath}`);
  console.log(JSON.stringify(workspace, null, 2));
}

function validateProblemStatement(value: ProblemStatement): void {
  if (!value.title || !Array.isArray(value.samples)) {
    throw new Error("Input JSON is not a valid ProblemStatement.");
  }
}
