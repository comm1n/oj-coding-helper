import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { extractContestProblems } from "../extractors/contestProblemsExtractor.js";
import { log } from "../logger.js";

export async function scanContestProblemsCommand(options: { file: string }): Promise<void> {
  const filePath = path.resolve(options.file);
  const html = await readFile(filePath, "utf8");
  log("scan:problems", "loaded contest problems page");

  const result = extractContestProblems(html, { baseUrl: loadConfig().baseUrl });
  log("extract:problems", `found ${result.problems.length} problems`);

  console.log(JSON.stringify(result, null, 2));
}
