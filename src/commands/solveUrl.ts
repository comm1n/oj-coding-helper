import { loadConfig } from "../config.js";
import { createBrowserSession } from "../browser/browserSession.js";
import { ensureLoggedInIfNeeded, gotoAndSettle, pageLooksLikeLogin, waitForProblemPageReady } from "../browser/navigation.js";
import { extractProblemStatement } from "../extractors/problemStatementExtractor.js";
import { log } from "../logger.js";
import { LlmService } from "../services/llmService.js";
import { createProblemWorkspace } from "../services/problemWorkspaceService.js";
import { fillCodeAndClickSubmit } from "../services/remoteSubmitAssistService.js";
import { normalizeSubmissionCode, saveSubmissionCode } from "../services/solutionDraftService.js";
import { shouldOmitMainFunction } from "../utils/submissionShape.js";

export async function solveUrlCommand(options: {
  url: string;
  overwrite?: boolean;
  allowRemoteSubmit?: boolean;
  submit?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const session = await createBrowserSession(config);

  try {
    await gotoAndSettle(session.page, options.url);
    if (await pageLooksLikeLogin(session.page)) {
      await ensureLoggedInIfNeeded(session.page);
      await gotoAndSettle(session.page, options.url);
    }

    await waitForProblemPageReady(session.page);
    const statement = extractProblemStatement(await session.page.content(), {
      sourceUrl: session.page.url()
    });

    if (statement.submitAvailable) {
      log("solve:url", "Submit button detected");
    }

    const workspace = await createProblemWorkspace(statement);
    const llm = new LlmService(config);
    if (!llm.enabled) {
      log("solve:url", "LLM is disabled; no solution files were written and no submit action was attempted");
      return;
    }

    const omitMain = shouldOmitMainFunction(statement);
    const code = normalizeSubmissionCode(await llm.generateSubmissionCode(statement), { omitMain });

    console.log(`\n===== submission code for ${statement.title} =====\n`);
    console.log(code.trim());
    console.log("\n===== end submission code =====\n");

    const paths = await saveSubmissionCode(code, {
      problemDir: workspace.problemDir,
      overwrite: Boolean(options.overwrite),
      omitMain
    });
    console.log(JSON.stringify({ workspace, solution: paths }, null, 2));

    const shouldSubmit = options.submit !== false && options.allowRemoteSubmit !== false;
    if (!shouldSubmit) {
      log("solve:url", "submit disabled by command option; generated answer is available for review");
      return;
    }

    if (!config.enableRemoteSubmitAssist) {
      log(
        "solve:url",
        "submit assist is disabled by ENABLE_REMOTE_SUBMIT_ASSIST=false; generated answer is available for review"
      );
      return;
    }

    const result = await fillCodeAndClickSubmit(session.page, code);
    log("solve:url", `filled code editor via ${result.editor}; clicked Submit via ${result.submitButton}`);
  } finally {
    await session.context.close();
  }
}
