export type ContestStatus = "Underway" | "Ended" | "Not Started" | string;

export interface ContestSummary {
  id?: string;
  title: string;
  startTime?: string;
  duration?: string;
  rule?: string;
  status?: ContestStatus;
  url?: string;
}

export interface ContestProblem {
  index: number;
  title: string;
  total?: number;
  acRate?: string;
  url?: string;
}

export interface ProblemSample {
  index: number;
  input: string;
  output: string;
}

export interface ProblemStatement {
  title: string;
  contestTitle?: string;
  problemIndex?: number;
  problemId?: string;
  timeLimit?: string;
  memoryLimit?: string;
  author?: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  samples: ProblemSample[];
  hint?: string;
  sourceUrl?: string;
  submitAvailable?: boolean;
}

export type PageKind =
  | "contest-index"
  | "contest-problems"
  | "problem-statement"
  | "unknown";

export interface ContestIndexScanResult {
  pageKind: "contest-index";
  contests: ContestSummary[];
}

export interface ContestProblemsScanResult {
  pageKind: "contest-problems";
  contestTitle?: string;
  problems: ContestProblem[];
}

export interface ProblemStatementScanResult extends ProblemStatement {
  pageKind: "problem-statement";
}

export type ScanResult =
  | ContestIndexScanResult
  | ContestProblemsScanResult
  | ProblemStatementScanResult;

export interface AppConfig {
  baseUrl: string;
  userDataDir: string;
  headless: boolean;
  enableLlm: boolean;
  enableRemoteSubmitAssist: boolean;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
}

export interface ProblemWorkspaceResult {
  problemDir: string;
  statementPath: string;
  mainCppPath: string;
  problemJsonPath: string;
}

export interface SampleRunResult {
  sampleName: string;
  passed: boolean;
  expected: string;
  actual: string;
  diff?: string;
  error?: string;
}
