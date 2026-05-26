import { loadConfig } from "../config.js";
import { createBrowserSession } from "../browser/browserSession.js";
import {
  ensureLoggedInIfNeeded,
  gotoAndSettle,
  waitForContestIndexReady,
  waitForProblemPageReady
} from "../browser/navigation.js";
import { extractContestIndex } from "../extractors/contestIndexExtractor.js";
import { extractContestProblems } from "../extractors/contestProblemsExtractor.js";
import { extractProblemStatement } from "../extractors/problemStatementExtractor.js";
import { log } from "../logger.js";
import { selectContest, selectProblem } from "../services/contestService.js";
import { createProblemWorkspace } from "../services/problemWorkspaceService.js";
import type { ProblemStatement } from "../types.js";
import { toContestProblemsUrl } from "../utils/url.js";

export async function flowCommand(options: {
  contestKeyword: string;
  problemIndex?: number;
  problemTitle?: string;
}): Promise<void> {
  const config = loadConfig();
  const session = await createBrowserSession(config);
  const contestsUrl = new URL("/contests", config.baseUrl).toString();

  try {
    log("flow", `opening ${contestsUrl}`);
    await gotoAndSettle(session.page, contestsUrl);
    await ensureLoggedInIfNeeded(session.page);
    await waitForContestIndexReady(session.page);

    await tryKeywordSearch(session.page, options.contestKeyword);
    const contestIndex = extractContestIndex(await session.page.content(), {
      baseUrl: config.baseUrl
    });
    const contest = selectContest(contestIndex.contests, options.contestKeyword);
    log("flow", `matched contest: ${contest.title}`);

    if (contest.url) {
      await gotoAndSettle(session.page, toContestProblemsUrl(contest.url, config.baseUrl));
    } else {
      await session.page.getByText(contest.title, { exact: false }).first().click();
      await session.page.waitForLoadState("domcontentloaded");
      await openProblemsTabIfNeeded(session.page);
    }

    const contestProblems = extractContestProblems(await session.page.content(), {
      baseUrl: session.page.url() || config.baseUrl
    });
    log("extract:problems", `found ${contestProblems.problems.length} problems`);

    const problem = selectProblem(contestProblems.problems, {
      ...(options.problemIndex !== undefined ? { index: options.problemIndex } : {}),
      ...(options.problemTitle ? { title: options.problemTitle } : {})
    });
    log("flow", `matched problem: ${problem.index} ${problem.title}`);

    if (problem.url) {
      await gotoAndSettle(session.page, problem.url);
    } else {
      await session.page.getByText(problem.title, { exact: false }).first().click();
      await session.page.waitForLoadState("domcontentloaded");
    }
    await waitForProblemPageReady(session.page);

    const extracted = extractProblemStatement(await session.page.content(), {
      sourceUrl: session.page.url()
    });
    const statement = enrichStatement(extracted, {
      contestTitle: contestProblems.contestTitle ?? contest.title,
      problemIndex: problem.index,
      sourceUrl: session.page.url()
    });
    log("extract:problem", `found ${statement.samples.length} sample pair${statement.samples.length === 1 ? "" : "s"}`);
    if (statement.submitAvailable) {
      log("flow", "Submit button detected; not clicked");
    }

    const workspace = await createProblemWorkspace(statement);
    console.log(
      JSON.stringify(
        {
          pageKind: "problem-statement",
          workspace,
          problem: statement
        },
        null,
        2
      )
    );
  } catch (error) {
    if (error instanceof Error) {
      error.message = `${error.message}\nFallback: manually open a contest problems page and run npm run scan:url -- --url "<url>", or manually open a problem page and run npm run scan:url -- --url "<url>".`;
    }
    throw error;
  } finally {
    await session.context.close();
  }
}

async function tryKeywordSearch(page: import("playwright").Page, keyword: string): Promise<void> {
  const searchBox = page
    .locator('input[placeholder*="Keyword"], input[placeholder*="keyword"], input[placeholder*="搜索"], input[type="search"]')
    .first();
  const visible = await searchBox.isVisible({ timeout: 1500 }).catch(() => false);
  if (!visible) {
    return;
  }

  await searchBox.fill(keyword);
  await searchBox.press("Enter").catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

async function openProblemsTabIfNeeded(page: import("playwright").Page): Promise<void> {
  if (/\/problems(?:[/?#]|$)/.test(page.url())) {
    return;
  }

  const problemsLink = page.getByText(/^题目$|^Problems$/i).first();
  const visible = await problemsLink.isVisible({ timeout: 2000 }).catch(() => false);
  if (visible) {
    await problemsLink.click();
    await page.waitForLoadState("domcontentloaded");
  }
}

function enrichStatement(
  statement: ProblemStatement,
  values: { contestTitle: string; problemIndex: number; sourceUrl: string }
): ProblemStatement {
  const enriched: ProblemStatement = {
    ...statement,
    contestTitle: statement.contestTitle ?? values.contestTitle,
    problemIndex: statement.problemIndex ?? values.problemIndex,
    sourceUrl: statement.sourceUrl ?? values.sourceUrl
  };
  return enriched;
}
