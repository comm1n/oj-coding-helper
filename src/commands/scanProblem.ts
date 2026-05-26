import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractProblemStatement } from "../extractors/problemStatementExtractor.js";
import { log } from "../logger.js";
import { saveProblemJsonForInit } from "../services/problemWorkspaceService.js";

export async function scanProblemCommand(options: {
  file: string;
  out?: string;
  save?: boolean;
}): Promise<void> {
  const filePath = path.resolve(options.file);
  const html = await readFile(filePath, "utf8");
  log("scan:problem", "loaded problem statement page");

  const result = extractProblemStatement(html);
  log("extract:problem", `found ${result.samples.length} sample pair${result.samples.length === 1 ? "" : "s"}`);
  if (result.submitAvailable) {
    log("extract:problem", "Submit button detected; not clicked");
  }

  if (options.save !== false || options.out) {
    await saveProblemJsonForInit(result, {
      ...(options.out ? { outPath: path.resolve(options.out) } : {})
    });
  }

  console.log(JSON.stringify(result, null, 2));
}
