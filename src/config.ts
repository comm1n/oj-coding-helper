import dotenv from "dotenv";
import type { AppConfig } from "./types.js";

dotenv.config();

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function loadConfig(): AppConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiBaseUrl = process.env.OPENAI_BASE_URL?.trim();
  const openaiModel = process.env.OPENAI_MODEL?.trim();

  return {
    baseUrl: process.env.BJFUOJ_BASE_URL?.trim() || "https://www.bjfuacm.com",
    userDataDir: process.env.USER_DATA_DIR?.trim() || ".playwright-profile",
    headless: parseBoolean(process.env.HEADLESS, false),
    enableLlm: parseBoolean(process.env.ENABLE_LLM, false),
    enableRemoteSubmitAssist: parseBoolean(process.env.ENABLE_REMOTE_SUBMIT_ASSIST, true),
    ...(openaiApiKey ? { openaiApiKey } : {}),
    ...(openaiBaseUrl ? { openaiBaseUrl } : {}),
    ...(openaiModel ? { openaiModel } : {})
  };
}
