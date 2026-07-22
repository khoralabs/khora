import { defineOntology } from "@khoralabs/memories-node/ontology";
import z from "zod";

export const khoraOntology = defineOntology({
  nodeLabels: {
    khora_profile: z.object({
      profileId: z.string(),
      username: z.string(),
    }),
    khora_post: z.object({
      postId: z.string(),
      kind: z.enum(["post", "status"]),
      authorProfileId: z.string().optional(),
      contentHash: z.string().optional(),
      topics: z.array(z.string()).optional(),
    }),
    khora_subscription: z.object({
      postId: z.string(),
      authorProfileId: z.string().optional(),
      contentHash: z.string().optional(),
      topics: z.array(z.string()).optional(),
    }),
  },
  edgeLabels: {
    authored_by: z.object({}),
  },
});
