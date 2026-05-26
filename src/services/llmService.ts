import type { AppConfig, ProblemStatement } from "../types.js";
import { shouldOmitMainFunction } from "../utils/submissionShape.js";

export type LlmTask =
  | "summarizeProblem"
  | "suggestApproach"
  | "analyzeCompileError"
  | "analyzeSampleDiff"
  | "generateEdgeCases"
  | "generateSolutionDraft"
  | "generateSubmissionCode";

const OJ_LEARNING_SYSTEM_PROMPT = [
  "You are an OJ debugging assistant for a personal OJ website.",
  "Help extract problem statements, generate submission-ready code, and support local debugging workflows.",
  "Produce concise, practical outputs that match the requested format exactly.",
  "When code is requested, follow the problem's required submission shape exactly."
].join("\n");

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      reasoning_content?: string;
    };
  }>;
}

export class LlmService {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.enableLlm && this.config.openaiApiKey);
  }

  async summarizeProblem(statement: ProblemStatement): Promise<string> {
    return this.run(
      "summarizeProblem",
      `${buildProblemPrompt(statement)}\n\n请用中文复述题意，说明输入、输出和样例含义。`
    );
  }

  async suggestApproach(statement: ProblemStatement): Promise<string> {
    return this.run(
      "suggestApproach",
      `${buildProblemPrompt(statement)}\n\n请给出解题思路、关键状态、复杂度和边界条件提醒。`
    );
  }

  async analyzeCompileError(stderr: string): Promise<string> {
    return this.run(
      "analyzeCompileError",
      `请解释下面的 C++ 编译错误，并给出排查步骤：\n\n${stderr}`
    );
  }

  async analyzeSampleDiff(expected: string, actual: string): Promise<string> {
    return this.run(
      "analyzeSampleDiff",
      `请解释样例输出差异的可能原因。\n\nExpected:\n${expected}\n\nActual:\n${actual}`
    );
  }

  async generateEdgeCases(statement: ProblemStatement): Promise<string> {
    return this.run(
      "generateEdgeCases",
      `${buildProblemPrompt(statement)}\n\n请列出适合本地测试的边界用例，并说明每个用例覆盖什么风险。`
    );
  }

  async generateSolutionDraft(statement: ProblemStatement): Promise<string> {
    return this.run(
      "generateSolutionDraft",
      buildSolutionDraftPrompt(statement)
    );
  }

  async generateSubmissionCode(statement: ProblemStatement): Promise<string> {
    return this.run(
      "generateSubmissionCode",
      buildSubmissionCodePrompt(statement)
    );
  }

  private async run(task: LlmTask, prompt: string): Promise<string> {
    if (!this.enabled) {
      return "LLM is disabled. Set ENABLE_LLM=true and OPENAI_API_KEY in .env to enable local explanation tasks.";
    }

    const response = await fetch(buildChatCompletionsUrl(this.config.openaiBaseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: this.config.openaiModel || "Qwen/Qwen2.5-72B-Instruct",
        messages: [
          {
            role: "system",
            content: OJ_LEARNING_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: `[${task}]\n${prompt}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return extractChatCompletionText(data);
  }
}

function buildChatCompletionsUrl(baseUrl: string | undefined): string {
  const normalized = (baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  return `${normalized}/chat/completions`;
}

function extractChatCompletionText(data: ChatCompletionResponse): string {
  const message = data.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => part.text)
      .filter((part): part is string => Boolean(part))
      .join("");
    if (text.trim()) {
      return text;
    }
  }

  if (message?.reasoning_content?.trim()) {
    return message.reasoning_content;
  }

  return JSON.stringify(data, null, 2);
}

function buildSolutionDraftPrompt(statement: ProblemStatement): string {
  const mainPolicy = shouldOmitMainFunction(statement)
    ? "C++ 代码不要包含 main 函数；题面中的默认 main 或测试 main 只作为调用约定参考，不能复制到代码块里。"
    : "C++ 代码按普通 OJ 题生成完整可提交程序；如果题目没有给出默认入口，请包含必要的 main 函数和完整输入输出逻辑。";

  return `${buildProblemPrompt(statement)}

请基于上面的题面生成一份用于人工审查和本地测试的题解草稿。请严格遵守：

1. 使用中文 Markdown。
2. 必须包含且仅按以下一级结构输出：
## 题意复述
## 解题思路
## 正确性说明
## 复杂度分析
## 边界条件
## C++ 参考实现草稿
3. 解题思路要说明核心算法、关键状态或数据结构，以及为什么适合题目约束。
4. 正确性说明要给出简短但可检查的论证。
5. C++ 代码必须放在唯一一个单独的 \`\`\`cpp 代码块中，便于工具提取。
6. ${mainPolicy}
7. 严格根据题目要求决定提交形态：需要完整程序就输出完整程序，需要补全类或函数就只输出补全部分。`;
}

function buildSubmissionCodePrompt(statement: ProblemStatement): string {
  const omitMain = shouldOmitMainFunction(statement);
  const mainPolicy = omitMain
    ? "题面说明 main 函数或测试入口已默认存在，绝对不要输出 main 函数、测试 main、示例 main 或任何会定义 main 的代码。"
    : "题面没有说明默认存在 main 函数，请按普通 OJ 题输出完整可提交 C++ 程序，包含必要的 main 函数和完整输入输出逻辑。";
  const submissionScope = omitMain
    ? "只提交题目需要你补全的类、函数、运算符重载、辅助函数和必要的 include/using。"
    : "保留完整程序所需的 include、using、函数签名、类定义、main 函数和输入输出逻辑。";

  return `${buildProblemPrompt(statement)}

请只输出可以直接粘贴到 OJ 提交框中的 C++ 代码。严格遵守：

1. 只输出代码本身，不要 Markdown，不要代码块标记，不要解释文字。
2. 不要写任何注释。
3. 不要输出题解、复杂度、样例说明或调试日志。
4. ${mainPolicy}
5. ${submissionScope}
6. 如果题面给出了默认存在的 main，请把它只当作调用约定参考，不能复制到答案里；如果题面没有这种要求，就正常生成完整程序。
7. 不要添加 OJ 不需要的包装代码、测试代码、本地调试代码、文件读写重定向或额外入口函数。
8. 删除所有与提交无关的内容，但不要删除题目正常提交所必需的 main 函数。`;
}

function buildProblemPrompt(statement: ProblemStatement): string {
  return [
    `Title: ${statement.title}`,
    statement.contestTitle ? `Contest: ${statement.contestTitle}` : undefined,
    statement.problemIndex !== undefined ? `Index: ${statement.problemIndex}` : undefined,
    statement.problemId ? `Problem ID: ${statement.problemId}` : undefined,
    statement.timeLimit ? `Time Limit: ${statement.timeLimit}` : undefined,
    statement.memoryLimit ? `Memory Limit: ${statement.memoryLimit}` : undefined,
    "",
    "Description:",
    statement.description,
    "",
    "Input:",
    statement.inputDescription,
    "",
    "Output:",
    statement.outputDescription,
    "",
    "Samples:",
    JSON.stringify(statement.samples, null, 2),
    statement.hint ? `Hint:\n${statement.hint}` : undefined,
    statement.sourceUrl ? `Source URL: ${statement.sourceUrl}` : undefined
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
