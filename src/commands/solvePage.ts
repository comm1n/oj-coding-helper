import { loadConfig } from "../config.js";
import { createBrowserSession } from "../browser/browserSession.js";
import { ensureLoggedInIfNeeded, gotoAndSettle, pageLooksLikeLogin, waitForProblemPageReady } from "../browser/navigation.js";
import { detectPageKind } from "../extractors/detectPageKind.js";
import { extractContestProblems } from "../extractors/contestProblemsExtractor.js";
import { extractProblemStatement } from "../extractors/problemStatementExtractor.js";
import { log, logError } from "../logger.js";
import { LlmService } from "../services/llmService.js";
import { createProblemWorkspace } from "../services/problemWorkspaceService.js";
import { fillCodeAndClickSubmit } from "../services/remoteSubmitAssistService.js";
import { normalizeSubmissionCode, saveSubmissionCode } from "../services/solutionDraftService.js";
import { shouldOmitMainFunction } from "../utils/submissionShape.js";
import type { ContestProblem, ProblemStatement } from "../types.js";
import type { Page } from "playwright";

interface SolvedProblemSummary {
  index?: number;
  title: string;
  sourceUrl?: string;
  problemDir?: string;
  solutionCppPath?: string;
  status: "submitted" | "saved" | "failed";
  error?: string;
}

export async function solvePageCommand(options: {
  url: string;
  overwrite?: boolean;
  submit?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const llm = new LlmService(config);
  if (!llm.enabled) {
    throw new Error("LLM is disabled. Set ENABLE_LLM=true and OPENAI_API_KEY in .env before running solve:page.");
  }

  const session = await createBrowserSession(config);
  const summaries: SolvedProblemSummary[] = [];

  try {
    await gotoAndSettle(session.page, options.url);
    if (await pageLooksLikeLogin(session.page)) {
      await ensureLoggedInIfNeeded(session.page);
      await gotoAndSettle(session.page, options.url);
    }

    const html = await session.page.content();
    const pageKind = detectPageKind(html);

    if (pageKind === "problem-statement") {
      const summary = await solveCurrentProblem(session.page, llm, {
        overwrite: Boolean(options.overwrite),
        submit: shouldSubmit(config.enableRemoteSubmitAssist, options)
      });
      summaries.push(summary);
      printBatchSummary(summaries);
      return;
    }

    if (pageKind !== "contest-problems") {
      throw new Error("Expected a problem list page or a problem statement page.");
    }

    const contestProblems = extractContestProblems(html, { baseUrl: session.page.url() || config.baseUrl });
    const problems = [...contestProblems.problems].sort((left, right) => left.index - right.index);
    log("solve:page", `found ${problems.length} problem(s)`);

    for (const problem of problems) {
      if (!problem.url) {
        summaries.push({
          index: problem.index,
          title: problem.title,
          status: "failed",
          error: "Problem URL was not found in the list page."
        });
        continue;
      }

      log("solve:page", `opening ${problem.index} ${problem.title}`);
      try {
        await gotoAndSettle(session.page, problem.url);
        const summary = await solveCurrentProblem(session.page, llm, {
          problem,
          ...(contestProblems.contestTitle ? { contestTitle: contestProblems.contestTitle } : {}),
          overwrite: Boolean(options.overwrite),
          submit: shouldSubmit(config.enableRemoteSubmitAssist, options)
        });
        summaries.push(summary);
      } catch (error) {
        logError("solve:page", error);
        summaries.push({
          index: problem.index,
          title: problem.title,
          sourceUrl: problem.url,
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    printBatchSummary(summaries);
    if (summaries.some((summary) => summary.status === "failed")) {
      process.exitCode = 1;
    }
  } finally {
    await session.context.close();
  }
}

async function solveCurrentProblem(
  page: Page,
  llm: LlmService,
  options: {
    contestTitle?: string;
    problem?: ContestProblem;
    overwrite: boolean;
    submit: boolean;
  }
): Promise<SolvedProblemSummary> {
  await waitForProblemPageReady(page);
  const extracted = extractProblemStatement(await page.content(), {
    sourceUrl: page.url()
  });
  const statement = enrichStatement(extracted, {
    ...(options.contestTitle ? { contestTitle: options.contestTitle } : {}),
    ...(options.problem ? { problem: options.problem } : {}),
    sourceUrl: page.url()
  });

  if (statement.submitAvailable) {
    log("solve:page", "Submit button detected");
  }

  const workspace = await createProblemWorkspace(statement);
  const omitMain = shouldOmitMainFunction(statement);
  const code = normalizeSubmissionCode(await llm.generateSubmissionCode(statement), { omitMain });
  const saved = await saveSubmissionCode(code, {
    problemDir: workspace.problemDir,
    overwrite: options.overwrite,
    omitMain
  });

  console.log(`\n===== ${statement.problemIndex ?? ""} ${statement.title} solution.cpp =====\n`);
  console.log(code.trim());
  console.log("\n===== end solution.cpp =====\n");

  let status: SolvedProblemSummary["status"] = "saved";
  if (options.submit) {
    const result = await fillCodeAndClickSubmit(page, code);
    log("solve:page", `filled code editor via ${result.editor}; clicked Submit via ${result.submitButton}`);
    status = "submitted";
  } else {
    log("solve:page", "submit disabled; solution.cpp was saved only");
  }

  const summary: SolvedProblemSummary = {
    title: statement.title,
    problemDir: workspace.problemDir,
    solutionCppPath: saved.solutionCppPath,
    status
  };
  if (statement.problemIndex !== undefined) summary.index = statement.problemIndex;
  if (statement.sourceUrl) summary.sourceUrl = statement.sourceUrl;
  return summary;
}

function enrichStatement(
  statement: ProblemStatement,
  values: { contestTitle?: string; problem?: ContestProblem; sourceUrl: string }
): ProblemStatement {
  const enriched: ProblemStatement = {
    ...statement,
    sourceUrl: statement.sourceUrl ?? values.sourceUrl
  };
  if (!enriched.contestTitle && values.contestTitle) {
    enriched.contestTitle = values.contestTitle;
  }
  if (enriched.problemIndex === undefined && values.problem) {
    enriched.problemIndex = values.problem.index;
  }
  return enriched;
}

function printBatchSummary(summaries: SolvedProblemSummary[]): void {
  const submitted = summaries.filter((summary) => summary.status === "submitted").length;
  const saved = summaries.filter((summary) => summary.status === "saved").length;
  const failed = summaries.filter((summary) => summary.status === "failed").length;
  console.log(
    JSON.stringify(
      {
        submitted,
        saved,
        failed,
        problems: summaries
      },
      null,
      2
    )
  );
}

function shouldSubmit(configEnabled: boolean, options: { submit?: boolean }): boolean {
  return configEnabled && options.submit !== false;
}
