import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SampleRunResult } from "../types.js";
import { ensureDir } from "../utils/safePath.js";

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export async function runSamples(problemDir: string): Promise<SampleRunResult[]> {
  const absoluteProblemDir = path.resolve(problemDir);
  const mainCpp = path.join(absoluteProblemDir, "main.cpp");
  const buildDir = path.join(absoluteProblemDir, ".build");
  const binary = path.join(buildDir, process.platform === "win32" ? "main.exe" : "main");
  await ensureDir(buildDir);

  const compiler = process.env.CXX || "g++";
  const compile = await runProcess(
    compiler,
    [mainCpp, "-std=c++17", "-O2", "-Wall", "-Wextra", "-o", binary],
    { cwd: absoluteProblemDir, timeoutMs: 30_000 }
  );

  if (compile.code !== 0) {
    throw new Error(`g++ compile failed:\n${compile.stderr || compile.stdout}`);
  }

  const samplePairs = await findSamplePairs(path.join(absoluteProblemDir, "samples"));
  if (samplePairs.length === 0) {
    throw new Error(`No sample*.in files found under ${path.join(absoluteProblemDir, "samples")}`);
  }

  const results: SampleRunResult[] = [];
  for (const pair of samplePairs) {
    const input = await readFile(pair.inputPath, "utf8");
    const expected = await readFile(pair.outputPath, "utf8").catch(() => "");
    const run = await runProcess(binary, [], {
      cwd: absoluteProblemDir,
      input,
      timeoutMs: 5_000
    });
    const actual = run.stdout;
    const passed = normalizeComparable(actual) === normalizeComparable(expected);
    const result: SampleRunResult = {
      sampleName: pair.name,
      passed,
      expected,
      actual
    };

    if (run.timedOut) {
      result.error = "Program timed out after 5 seconds.";
    } else if (run.code !== 0) {
      result.error = run.stderr || `Program exited with code ${run.code}.`;
    }

    if (!passed) {
      result.diff = buildSimpleDiff(expected, actual);
    }

    results.push(result);
  }

  return results;
}

async function findSamplePairs(samplesDir: string): Promise<Array<{ name: string; inputPath: string; outputPath: string }>> {
  const entries = await readdir(samplesDir).catch(() => []);
  return entries
    .filter((entry) => /^sample\d+\.in$/i.test(entry))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((entry) => {
      const name = entry.replace(/\.in$/i, "");
      return {
        name,
        inputPath: path.join(samplesDir, entry),
        outputPath: path.join(samplesDir, `${name}.out`)
      };
    });
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; input?: string; timeoutMs: number }
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

function normalizeComparable(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trimEnd();
}

function buildSimpleDiff(expected: string, actual: string): string {
  const expectedLines = normalizeComparable(expected).split("\n");
  const actualLines = normalizeComparable(actual).split("\n");
  const max = Math.max(expectedLines.length, actualLines.length);
  const lines: string[] = [];

  for (let index = 0; index < max && lines.length < 12; index += 1) {
    const expectedLine = expectedLines[index] ?? "<missing>";
    const actualLine = actualLines[index] ?? "<missing>";
    if (expectedLine !== actualLine) {
      lines.push(`line ${index + 1}`);
      lines.push(`  expected: ${expectedLine}`);
      lines.push(`  actual:   ${actualLine}`);
    }
  }

  return lines.join("\n");
}
