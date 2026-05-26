import path from "node:path";
import { log } from "../logger.js";
import { runSamples } from "../services/localTestService.js";

export async function runSamplesCommand(options: { problemDir: string }): Promise<void> {
  const problemDir = path.resolve(options.problemDir);
  log("samples", `running samples in ${problemDir}`);

  const results = await runSamples(problemDir);
  let failed = 0;

  for (const result of results) {
    if (result.passed && !result.error) {
      console.log(`[PASS] ${result.sampleName}`);
      continue;
    }

    failed += 1;
    console.log(`[FAIL] ${result.sampleName}`);
    if (result.error) {
      console.log(result.error);
    }
    if (result.diff) {
      console.log(result.diff);
    }
  }

  console.log(`\n${results.length - failed}/${results.length} sample(s) passed.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}
