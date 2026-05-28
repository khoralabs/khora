import { KHORA_TOPIC_LABEL_PREFIX, topicSlugToLabelKind } from "@khoralabs/khora-contracts";

export { KHORA_TOPIC_LABEL_PREFIX, topicSlugToLabelKind };

export function topicSlugsToLabelKinds(slugs: readonly string[] | undefined): string[] {
  if (slugs === undefined) return [];
  return slugs.map(topicSlugToLabelKind);
}
