# BJFUOJ 学习辅助 Agent 工具

这是一个面向 BJFUOJ 的本地学习辅助工具。它可以读取比赛列表、题目列表和具体题面，整理样例，生成本地练习目录，调用 LLM 生成提交代码或题解草稿，并运行本地样例测试。

## 默认行为

- 本项目用于个人 OJ 网站调试。
- `solve` 和 `solve:url` 默认会读取题目、生成 `solution.cpp`、自动填入代码框并点击 Submit。
- `assist:submit` 在你输入 `CONFIRM_SAVE` 后默认会填入 `solution.cpp` 并点击 Submit。
- 如果只想生成代码、不提交，使用 `--no-submit`。

## 安装

```bash
npm install
npx playwright install chromium
```

检查项目：

```bash
npm run typecheck
```

## LLM API 配置

复制 `.env.example`：

```bash
copy .env.example .env
```

编辑 `.env`：

```env
BJFUOJ_BASE_URL=https://www.bjfuacm.com
USER_DATA_DIR=.playwright-profile
HEADLESS=false

ENABLE_LLM=true
OPENAI_API_KEY=你的API_Key
OPENAI_BASE_URL=
OPENAI_MODEL=

# 默认自动填入代码并点击 Submit。设为 false 可全局关闭提交动作。
ENABLE_REMOTE_SUBMIT_ASSIST=true
```

本项目使用 OpenAI 兼容的 `/chat/completions` 接口。硅基流动可以直接使用上面的 `OPENAI_BASE_URL`。

也可以换成其他硅基流动模型，例如：

```env
OPENAI_MODEL=Pro/deepseek-ai/DeepSeek-R1
```

未设置 `ENABLE_LLM=true` 或 `OPENAI_API_KEY` 时，LLM 命令会提示配置，不会写入题解文件。

## 常用流程

### 1. 从真实题目 URL 读取题面

```bash
npm run learn:url -- --url "[https://www.bjfuacm.com/contest/849/problem/1](https://www.example.com/xxx/problem/1)"
```

如果需要登录，会打开浏览器让你手动登录。登录状态保存在 `.playwright-profile`。

命令会生成类似目录：

```text
output/problems/001-JourneytotheWest/
  problem.json
  statement.md
  main.cpp
  notes.md
  samples/
```

### 2. 调用 LLM 生成题解草稿

```bash
npm run llm:solution -- --from "output/problems/001-JourneytotheWest/problem.json"
```

生成：

```text
output/problems/001-JourneytotheWest/llm-solution.md
output/problems/001-JourneytotheWest/solution.cpp
```

如果文件已存在，默认不会覆盖。需要覆盖时：

```bash
npm run llm:solution -- --from "output/problems/001-JourneytotheWest/problem.json" --overwrite
```

### 3. 本地跑样例

把你想测试的代码放进 `main.cpp`，然后运行：

```bash
npm run run:samples -- --problem-dir "output/problems/001-JourneytotheWest"
```

### 4. 提交辅助

```bash
npm run assist:submit -- --from "output/problems/001-JourneytotheWest/problem.json"
```

它会：

1. 显示 `solution.cpp`。
2. 要求你输入 `CONFIRM_SAVE`。
3. 打开题目页面。
4. 自动填入代码并点击 Submit。
5. 停在终端等待你按 Enter。

如果只想打开页面、不填入也不点击：

```bash
npm run assist:submit -- --from "output/problems/001-JourneytotheWest/problem.json" --no-submit
```

### 5. 最简批量流程：输入题目列表页 URL

```bash
npm run solve -- --url "https://www.bjfuacm.com/contest/849/problems"
```

它会读取这个页面中的题目列表，按题号依次打开每一道题，创建本地练习目录，调用 LLM 生成每题的提交代码，然后自动填入代码框并点击 Submit。

每道题会保存：

```text
solution.cpp
```

`solution.cpp` 只保存 OJ 提交框需要的代码，不保存 Markdown 题解、解释文字或注释，并且不会包含 `main` 函数。

如果文件已存在，默认不会覆盖。需要重新生成时：

```bash
npm run solve -- --url "https://www.example.com/xxx/problems" --overwrite
```

如果只生成代码、不提交：

```bash
npm run solve -- --url "https://www.example.com/xxx/problems" --no-submit
```

如果只想处理单个题目 URL，并默认自动提交：

```bash
npm run solve:url -- --url "https://www.example.com/xxx/problem/1"
```

单题只生成代码、不提交：

```bash
npm run solve:url -- --url "https://www.example.com/xxx/problem/1" --no-submit
```

## 本地 HTML 解析

读取自带样例：

```bash
npm run scan:contest-index -- --file "samples/saved-pages/contest-list.html"
npm run scan:contest-problems -- --file "samples/saved-pages/contest-problems.html"
npm run scan:problem -- --file "samples/saved-pages/problem-journey-to-the-west.html"
```

生成本地题目目录：

```bash
npm run init-problem -- --from "output/problems/JourneytotheWest/problem.json"
```

## 真实比赛流程

按比赛关键词和题号读取：

```bash
npm run flow -- --contest-keyword "2025-name-OJ-实验" --problem-index 1
```

如果页面点击不稳定，可以手动进入题目页后运行：

```bash
npm run scan:url -- --url "https://www.example.com/xxx/problem/1"
```

## 命令列表

```bash
npm run dev
npm run typecheck
npm run scan:contest-index -- --file "samples/saved-pages/contest-list.html"
npm run scan:contest-problems -- --file "samples/saved-pages/contest-problems.html"
npm run scan:problem -- --file "samples/saved-pages/problem-journey-to-the-west.html"
npm run scan:url -- --url "https://www.example.com/xxx/problem/1"
npm run flow -- --contest-keyword "2025-name-OJ-实验" --problem-index 1
npm run learn:url -- --url "https://www.example.com/xxx/problem/1"
npm run llm:solution -- --from "output/problems/001-JourneytotheWest/problem.json"
npm run solve -- --url "https://www.example.com/xxx/problems"
npm run solve:page -- --url "https://www.example.com/xxx/problems"
npm run solve:url -- --url "https://www.example.com/xxx/problem/1"
npm run assist:submit -- --from "output/problems/001-JourneytotheWest/problem.json"
npm run init-problem -- --from "output/problems/JourneytotheWest/problem.json"
npm run run:samples -- --problem-dir "output/problems/001-JourneytotheWest"
npm run analyze:submission -- --status CE
```

## 常见问题

### Playwright 提示浏览器不存在

运行：

```bash
npx playwright install chromium
```

### g++ 不存在

安装 MinGW、MSYS2、LLVM 或其他 C++ 编译器，并确保 `g++` 在 PATH 中。也可以通过环境变量 `CXX` 指定编译器。

### LLM 命令没有生成文件

确认 `.env` 中设置了：

```env
ENABLE_LLM=true
OPENAI_API_KEY=你的_API_Key
OPENAI_BASE_URL=
OPENAI_MODEL=
```

### 已经有 llm-solution.md 或 solution.cpp

默认不会覆盖。确认要覆盖时加：

```bash
--overwrite
```
