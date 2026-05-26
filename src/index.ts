import { Command } from "commander";
import { logError } from "./logger.js";
import { scanContestIndexCommand } from "./commands/scanContestIndex.js";
import { scanContestProblemsCommand } from "./commands/scanContestProblems.js";
import { scanProblemCommand } from "./commands/scanProblem.js";
import { scanUrlCommand } from "./commands/scanUrl.js";
import { flowCommand } from "./commands/flow.js";
import { initProblemCommand } from "./commands/initProblem.js";
import { runSamplesCommand } from "./commands/runSamples.js";
import { analyzeSubmissionCommand } from "./commands/analyzeSubmission.js";
import { learnUrlCommand } from "./commands/learnUrl.js";
import { llmSolutionCommand } from "./commands/llmSolution.js";
import { assistSubmitCommand } from "./commands/assistSubmit.js";
import { solveUrlCommand } from "./commands/solveUrl.js";
import { solvePageCommand } from "./commands/solvePage.js";

const program = new Command();

program
  .name("oj-learning-agent")
  .description("BJFUOJ personal OJ debugging assistant")
  .version("0.1.0");

program
  .command("scan:contest-index")
  .requiredOption("--file <file>", "saved BJFUOJ contest list HTML file")
  .action((options) => runCommand(() => scanContestIndexCommand(options)));

program
  .command("scan:contest-problems")
  .requiredOption("--file <file>", "saved BJFUOJ contest problems HTML file")
  .action((options) => runCommand(() => scanContestProblemsCommand(options)));

program
  .command("scan:problem")
  .requiredOption("--file <file>", "saved BJFUOJ problem statement HTML file")
  .option("--out <path>", "write ProblemStatement JSON to a specific file")
  .option("--no-save", "do not write output/problems/<title>/problem.json")
  .action((options) => runCommand(() => scanProblemCommand(options)));

program
  .command("scan:url")
  .requiredOption("--url <url>", "BJFUOJ URL to read with Playwright")
  .action((options) => runCommand(() => scanUrlCommand(options)));

program
  .command("flow")
  .requiredOption("--contest-keyword <keyword>", "contest title keyword")
  .option("--problem-index <index>", "problem index in the contest", parseInteger)
  .option("--problem-title <title>", "problem title keyword")
  .action((options) => runCommand(() => flowCommand(options)));

program
  .command("learn:url")
  .requiredOption("--url <url>", "BJFUOJ problem URL to read and initialize locally")
  .action((options) => runCommand(() => learnUrlCommand(options)));

program
  .command("llm:solution")
  .requiredOption("--from <path>", "ProblemStatement JSON path")
  .option("--out-dir <dir>", "directory to write llm-solution.md and solution.cpp")
  .option("--overwrite", "overwrite existing llm-solution.md and solution.cpp")
  .action((options) => runCommand(() => llmSolutionCommand(options)));

program
  .command("solve:url")
  .requiredOption("--url <url>", "BJFUOJ problem URL to read, generate submission code, fill it, and click Submit")
  .option("--overwrite", "overwrite existing llm-solution.md and solution.cpp")
  .option("--no-submit", "generate solution.cpp only; do not fill code or click Submit")
  .action((options) => runCommand(() => solveUrlCommand(options)));

program
  .command("solve:page")
  .requiredOption("--url <url>", "BJFUOJ problem list URL; each problem is opened, solved, filled, and submitted sequentially")
  .option("--overwrite", "overwrite existing solution.cpp files")
  .option("--no-submit", "generate solution.cpp files only; do not fill code or click Submit")
  .action((options) => runCommand(() => solvePageCommand(options)));

program
  .command("assist:submit")
  .requiredOption("--from <path>", "ProblemStatement JSON path")
  .option("--problem-dir <dir>", "directory containing solution.cpp")
  .option("--confirm <text>", "non-interactive confirmation; must be CONFIRM_SAVE")
  .option("--no-submit", "open the page only; do not fill code or click Submit")
  .action((options) => runCommand(() => assistSubmitCommand(options)));

program
  .command("init-problem")
  .requiredOption("--from <path>", "ProblemStatement JSON path")
  .action((options) => runCommand(() => initProblemCommand(options)));

program
  .command("run:samples")
  .requiredOption("--problem-dir <dir>", "local problem workspace directory")
  .action((options) => runCommand(() => runSamplesCommand(options)));

program
  .command("analyze:submission")
  .option("--status <status>", "CE, WA, RE, or TLE")
  .option("--file <file>", "local compile/runtime log file")
  .action((options) => runCommand(() => analyzeSubmissionCommand(options)));

await program.parseAsync(process.argv);

async function runCommand(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    logError("error", error);
    process.exitCode = 1;
  }
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer: ${value}`);
  }
  return parsed;
}
