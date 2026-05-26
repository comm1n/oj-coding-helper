import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config.js";
import { extractContestIndex } from "../extractors/contestIndexExtractor.js";
import { log } from "../logger.js";

export async function scanContestIndexCommand(options: { file: string }): Promise<void> {
  const filePath = path.resolve(options.file);
  const html = await readFile(filePath, "utf8");
  log("scan:index", "loaded contest list page");

  const result = extractContestIndex(html, { baseUrl: loadConfig().baseUrl });
  log("extract:index", `found ${result.contests.length} contests`);

  console.log(JSON.stringify(result, null, 2));
}
