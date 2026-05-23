import type { InboxPostReason } from "@khoralabs/agent-relay";
import { type AtriumPost, atriumProbeLexicalText } from "@khoralabs/atrium-contracts";
import { type SearchParams, search } from "@khoralabs/memories-core";
import { embedTextChunks } from "@khoralabs/memories-core/helpers";
import { agentScope } from "./atrium-namespace.ts";
import type { AtriumMemoriesHost } from "./bootstrap.ts";

function probeMatchQueries(probe: AtriumPost): string[] {
  const attrs = probe.attributes;
  const queries = new Set<string>();
  const add = (part: string | undefined): void => {
    if (part !== undefined && part.trim().length > 0) queries.add(part.trim());
  };
  add(probe.title);
  add(probe.body);
  for (const topic of probe.topics ?? []) add(topic);
  for (const domain of attrs?.domains ?? []) add(domain);
  add(attrs?.stage);
  add(attrs?.engagementType);
  const compact = [
    probe.title,
    ...(probe.topics ?? []),
    ...(attrs?.domains ?? []),
    attrs?.stage,
    attrs?.engagementType,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  add(compact);
  return [...queries];
}

export async function scoreProbeHitAgainstRecipientScope(
  memories: AtriumMemoriesHost,
  probe: AtriumPost,
  recipientProfileId: string,
): Promise<number | undefined> {
  if (probe.kind !== "probe") return undefined;
  const queries = probeMatchQueries(probe);
  if (queries.length === 0) return undefined;
  const embedText = atriumProbeLexicalText(probe).trim();
  let embedVector: number[] | undefined;
  if (memories.embeddingModel !== undefined && embedText.length > 0) {
    const vectors = await embedTextChunks(memories.embeddingModel, [embedText]);
    embedVector = vectors[0];
  }

  let best: number | undefined;
  const namespace = agentScope(memories.namespaceRoot, recipientProfileId);
  for (const text of queries) {
    let content: SearchParams["content"];
    if (embedVector !== undefined && embedVector.length > 0) {
      content = { text, vector: embedVector };
    } else {
      content = { text };
    }
    const hits = search(
      { persistence: memories.persistence },
      {
        namespace,
        content,
        options: { topK: 1 },
      },
    );
    const score = hits[0]?.score;
    if (score === undefined) continue;
    if (best === undefined || score > best) best = score;
  }
  return best;
}

export async function addProbeHitReasons(
  memories: AtriumMemoriesHost,
  probe: AtriumPost,
  byRecipient: Map<string, InboxPostReason[]>,
  profileIdForPrincipal: (principalId: string) => string | undefined,
): Promise<void> {
  if (probe.kind !== "probe") return;
  for (const [recipientId, reasons] of byRecipient) {
    const profileId = profileIdForPrincipal(recipientId);
    if (profileId === undefined) continue;
    const score = await scoreProbeHitAgainstRecipientScope(memories, probe, profileId);
    if (score === undefined) continue;
    reasons.push({ kind: "probe-hit", probePostId: probe.id, score });
  }
}
