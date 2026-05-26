import { loadConfig } from "../config.js";
import { createBrowserSession } from "../browser/browserSession.js";
import { ensureLoggedInIfNeeded, gotoAndSettle, pageLooksLikeLogin } from "../browser/navigation.js";
import { detectPageKind } from "../extractors/detectPageKind.js";
import { extractContestIndex } from "../extractors/contestIndexExtractor.js";
import { extractContestProblems } from "../extractors/contestProblemsExtractor.js";
import { extractProblemStatement } from "../extractors/problemStatementExtractor.js";
import { log } from "../logger.js";

export async function scanUrlCommand(options: { url: string }): Promise<void> {
  const config = loadConfig();
  const session = await createBrowserSession(config);

  try {
    await gotoAndSettle(session.page, options.url);
    if (await pageLooksLikeLogin(session.page)) {
      await ensureLoggedInIfNeeded(session.page);
      await gotoAndSettle(session.page, options.url);
    }

    const html = await session.page.content();
    const pageKind = detectPageKind(html);
    log("scan:url", `detected page kind: ${pageKind}`);

    if (pageKind === "contest-index") {
      console.log(JSON.stringify(extractContestIndex(html, { baseUrl: config.baseUrl }), null, 2));
      return;
    }

    if (pageKind === "contest-problems") {
      console.log(JSON.stringify(extractContestProblems(html, { baseUrl: session.page.url() || config.baseUrl }), null, 2));
      return;
    }

    if (pageKind === "problem-statement") {
      const result = extractProblemStatement(html, { sourceUrl: session.page.url() });
      if (result.submitAvailable) {
        log("scan:url", "Submit button detected; not clicked");
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    throw new Error("Unable to recognize this BJFUOJ page. Expected contest list, contest problems, or problem statement.");
  } finally {
    await session.context.close();
  }
}
