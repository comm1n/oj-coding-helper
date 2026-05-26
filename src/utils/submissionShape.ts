import type { ProblemStatement } from "../types.js";

export function shouldOmitMainFunction(statement: ProblemStatement): boolean {
  const text = [
    statement.description,
    statement.inputDescription,
    statement.outputDescription,
    statement.hint ?? "",
    statement.samples.map((sample) => `${sample.input}\n${sample.output}`).join("\n")
  ].join("\n");
  const inline = text.replace(/\s+/g, " ").trim();
  const hasMainSignature = /\b(?:int|signed|unsigned|auto|void|int32_t|int64_t|long\s+long)\s+main\s*\(/i.test(text);

  const explicitNoMainPatterns = [
    /(?:不能|不要|不可|禁止|请勿|无需|不需要|不用|不必).{0,30}(?:main|主函数)/i,
    /(?:main|主函数).{0,30}(?:不能|不要|不可|禁止|请勿|无需|不需要|不用|不必)/i,
    /(?:默认存在|默认有|已经存在|已存在|已有|已给出|已提供|题目给出|系统给出|OJ\s*提供).{0,40}(?:main|主函数)/i,
    /(?:main|主函数).{0,40}(?:默认存在|默认有|已经存在|已存在|已有|已给出|已提供)/i
  ];

  if (explicitNoMainPatterns.some((pattern) => pattern.test(inline))) {
    return true;
  }

  const defaultProvidedCodePatterns = [
    /(?:下述|下面|以下).{0,20}(?:代码|测试函数|测试代码).{0,40}(?:默认存在|默认有|已经存在|已存在|已有|已给出|已提供)/i,
    /(?:默认存在|默认有|已经存在|已存在|已有|已给出|已提供).{0,40}(?:下述|下面|以下).{0,20}(?:代码|测试函数|测试代码)/i,
    /(?:提交代码时|提交时|答案|提交答案).{0,30}(?:不能|不要|不可|禁止|请勿).{0,30}(?:包括|包含).{0,30}(?:以下代码|下述代码|下面代码)/i
  ];

  return hasMainSignature && defaultProvidedCodePatterns.some((pattern) => pattern.test(inline));
}
