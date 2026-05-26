import path from "node:path";
import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import type { AppConfig } from "../types.js";
import { ensureDir } from "../utils/safePath.js";

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  userDataDir: string;
}

export async function createBrowserSession(config: AppConfig): Promise<BrowserSession> {
  const userDataDir = path.resolve(config.userDataDir);
  await ensureDir(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: config.headless,
    viewport: { width: 1440, height: 1000 }
  });
  const page = context.pages()[0] ?? (await context.newPage());

  return {
    context,
    page,
    userDataDir
  };
}
