import { readFile } from "node:fs/promises";
import path from "node:path";

export async function analyzeSubmissionCommand(options: {
  file?: string;
  status?: string;
}): Promise<void> {
  const status = options.status?.trim().toUpperCase();
  const content = options.file ? await readFile(path.resolve(options.file), "utf8") : "";

  const lines = [
    "analyze:submission explains local submission results and logs.",
    ""
  ];

  if (status) {
    lines.push(...explainStatus(status));
  } else {
    lines.push("Pass --status CE|WA|RE|TLE and optionally --file <local-log> for a local explanation.");
  }

  if (content) {
    lines.push("", "Local log excerpt:", content.slice(0, 3000));
  }

  console.log(lines.join("\n"));
}

function explainStatus(status: string): string[] {
  if (status === "CE") {
    return [
      "CE usually means compile error.",
      "Check missing headers, mismatched function signatures, class names required by the problem, and whether main() is allowed."
    ];
  }
  if (status === "WA") {
    return [
      "WA usually means wrong answer.",
      "Compare sample formatting, edge cases, integer overflow, sorting order, and branch conditions."
    ];
  }
  if (status === "RE") {
    return [
      "RE usually means runtime error.",
      "Check out-of-bounds access, division by zero, null pointers, recursion depth, and invalid input assumptions."
    ];
  }
  if (status === "TLE") {
    return [
      "TLE usually means time limit exceeded.",
      "Check algorithm complexity, nested loops, repeated I/O flushes, and missing pruning or memoization."
    ];
  }
  return [`Unknown status: ${status}. Supported local explanations: CE, WA, RE, TLE.`];
}
