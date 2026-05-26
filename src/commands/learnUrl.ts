import { loadConfig } from "../config.js";
import { createBrowserSession } from "../browser/browserSession.js";
import { ensureLoggedInIfNeeded, gotoAndSettle, pageLooksLikeLogin, waitForProblemPageReady } from "../browser/navigation.js";
import { extractProblemStatement } from "../extractors/problemStatementExtractor.js";
import { log } from "../logger.js";
import { createProblemWorkspace } from "../services/problemWorkspaceService.js";

export async function learnUrlCommand(options: { url: string }): Promise<void> {
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
      log("learn:url", "Submit button detected; not clicked");
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
  } finally {
    await session.context.close();
  }
}
