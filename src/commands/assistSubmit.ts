import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ProblemStatement } from "../types.js";
import { loadConfig } from "../config.js";
import { createBrowserSession } from "../browser/browserSession.js";
import { ensureLoggedInIfNeeded, gotoAndSettle, pageLooksLikeLogin } from "../browser/navigation.js";
import { log } from "../logger.js";
import { fillCodeAndClickSubmit } from "../services/remoteSubmitAssistService.js";
import { resolveProblemDirFromJsonPath } from "../services/solutionDraftService.js";
import { readJsonFile } from "../utils/safeJson.js";

export async function assistSubmitCommand(options: {
  from: string;
  problemDir?: string;
  confirm?: string;
  allowRemoteSubmit?: boolean;
  submit?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const fromPath = path.resolve(options.from);
  const raw = await readJsonFile<ProblemStatement | { problem: ProblemStatement }>(fromPath);
  const statement = "problem" in raw ? raw.problem : raw;
  validateProblemStatement(statement);

  const problemDir = options.problemDir
    ? path.resolve(options.problemDir)
    : resolveProblemDirFromJsonPath(fromPath, statement);
  const solutionPath = path.join(problemDir, "solution.cpp");
  const solution = await readFile(solutionPath, "utf8");

  console.log(`\n===== ${solutionPath} =====\n`);
  console.log(solution);
  console.log("===== end solution.cpp =====\n");
  console.log("After confirmation, this tool opens the problem page, fills solution.cpp, and clicks Submit.");
  console.log("Use --no-submit to open the page without filling or clicking Submit.");

  const confirmed = options.confirm === "CONFIRM_SAVE" || (await askForConfirmation());
  if (!confirmed) {
    log("assist:submit", "confirmation not received; nothing opened");
    return;
  }

  if (!statement.sourceUrl) {
    throw new Error("Problem JSON does not contain sourceUrl, so the problem page cannot be opened.");
  }

  const session = await createBrowserSession(config);
  try {
    await gotoAndSettle(session.page, statement.sourceUrl);
    if (await pageLooksLikeLogin(session.page)) {
      await ensureLoggedInIfNeeded(session.page);
      await gotoAndSettle(session.page, statement.sourceUrl);
    }

    const shouldSubmit = options.submit !== false && options.allowRemoteSubmit !== false;
    if (!shouldSubmit) {
      log("assist:submit", "opened problem page; Submit was not clicked because --no-submit was used");
      await waitForUserToFinish("The browser is open. Submit manually if needed, then press Enter here to close it.");
      return;
    }

    if (!config.enableRemoteSubmitAssist) {
      log(
        "assist:submit",
        "submit assist is disabled by ENABLE_REMOTE_SUBMIT_ASSIST=false"
      );
      await waitForUserToFinish("The browser is open. Press Enter here to close it.");
      return;
    }

    const result = await fillCodeAndClickSubmit(session.page, solution);
    log("assist:submit", `filled code editor via ${result.editor}; clicked Submit via ${result.submitButton}`);
    await waitForUserToFinish("Submit was clicked. Review the browser result, then press Enter here to close it.");
  } finally {
    await session.context.close();
  }
}

async function askForConfirmation(): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('Type "CONFIRM_SAVE" to open the problem page, fill solution.cpp, and click Submit: ');
    return answer.trim() === "CONFIRM_SAVE";
  } finally {
    rl.close();
  }
}

async function waitForUserToFinish(message: string): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

function validateProblemStatement(value: ProblemStatement): void {
  if (!value.title || !Array.isArray(value.samples)) {
    throw new Error("Input JSON is not a valid ProblemStatement.");
  }
}
