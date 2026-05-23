import { fuseRrf, type RrfArm } from "@khoralabs/reciprocal-rank-fusion";
import type { StandingSearchRequest } from "./search-request.ts";
import { tokenizeForOverlap } from "./tokenizer.ts";
import type { PercolatorCandidate } from "./types.ts";

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function lexicalOverlapScore(queryText: string, candidateText: string): number {
  const queryTokens = tokenizeForOverlap(queryText);
  if (queryTokens.size === 0) return 0;
  const candidateTokens = tokenizeForOverlap(candidateText);
  if (candidateTokens.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) hits += 1;
  }
  return hits / queryTokens.size;
}

export function scoreCandidateAgainstSearch(
  candidate: PercolatorCandidate,
  search: StandingSearchRequest,
  queryVector?: readonly number[],
): number {
  const lexicalWeight = search.options?.arms?.lexical ?? 1;
  const vectorWeight = search.options?.arms?.vector ?? 1;
  const maxVectorDistance = search.options?.maxVectorDistance;
  const arms: RrfArm<string>[] = [];

  const queryText = search.content.text?.trim() ?? "";
  const candidateText = candidate.content.text?.trim() ?? "";
  if (queryText.length > 0 && candidateText.length > 0) {
    const overlap = lexicalOverlapScore(queryText, candidateText);
    if (overlap > 0) {
      arms.push({
        armId: "lexical",
        weight: lexicalWeight,
        ranked: [{ id: candidate.candidateId, boost: overlap }],
      });
    }
  }

  const candidateVector = candidate.content.vector;
  const resolvedQueryVector =
    queryVector ?? (search.content.vector !== undefined ? search.content.vector : undefined);
  if (
    resolvedQueryVector !== undefined &&
    resolvedQueryVector.length > 0 &&
    candidateVector !== undefined &&
    candidateVector.length > 0
  ) {
    const similarity = cosineSimilarity(resolvedQueryVector, candidateVector);
    const distance = 1 - similarity;
    if (maxVectorDistance === undefined || distance <= maxVectorDistance) {
      arms.push({
        armId: "vector",
        weight: vectorWeight,
        ranked: [{ id: candidate.candidateId, boost: Math.max(similarity, 0) }],
      });
    }
  }

  if (arms.length === 0) return 0;
  const fused = fuseRrf(arms, { maxPerArm: 1 });
  return fused[0]?.score ?? 0;
}
