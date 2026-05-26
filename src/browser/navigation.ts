import type { Page } from "playwright";
import { log } from "../logger.js";

export async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

export async function pageLooksLikeLogin(page: Page): Promise<boolean> {
  const passwordInputs = await page.locator('input[type="password"]').count();
  if (passwordInputs > 0) {
    return true;
  }

  const url = page.url().toLowerCase();
  if (url.includes("login")) {
    return true;
  }

  const loginText = await page
    .getByText(/登录|Login|Sign in/i)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  return loginText;
}

export async function waitForManualLogin(page: Page): Promise<void> {
  log("flow", "login required; please finish login in the opened browser window");
  await page
    .waitForFunction(
      () => !document.querySelector('input[type="password"]') && !/login/i.test(location.href),
      undefined,
      { timeout: 300_000 }
    )
    .catch(() => {
      throw new Error("Login was not completed within 5 minutes. Please rerun after logging in.");
    });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

export async function ensureLoggedInIfNeeded(page: Page): Promise<void> {
  if (await pageLooksLikeLogin(page)) {
    await waitForManualLogin(page);
  }
}

export async function waitForContestIndexReady(page: Page): Promise<void> {
  await page
    .waitForSelector("#contest-list, table, text=All Contests", { timeout: 30_000 })
    .catch(() => {
      throw new Error("Contest list page did not become readable in time.");
    });
}

export async function waitForProblemPageReady(page: Page): Promise<void> {
  await page
    .waitForSelector("#problem-content", { timeout: 30_000 })
    .catch(() => {
      throw new Error("Problem statement page did not contain #problem-content in time.");
    });
}
