import type { ContestProblem, ContestSummary } from "../types.js";
import { findContestByKeyword } from "../extractors/contestIndexExtractor.js";
import { findProblemByIndexOrTitle } from "../extractors/contestProblemsExtractor.js";

export function selectContest(contests: ContestSummary[], keyword: string): ContestSummary {
  return findContestByKeyword(contests, keyword);
}

export function selectProblem(
  problems: ContestProblem[],
  options: { index?: number; title?: string }
): ContestProblem {
  return findProblemByIndexOrTitle(problems, options);
}
