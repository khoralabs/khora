import { defineOntology } from "@khoralabs/memories-core";
import z from "zod";

export const atriumOntology = defineOntology({
  nodeLabels: {
    atrium_profile: z.object({
      profileId: z.string(),
      username: z.string(),
    }),
    atrium_post: z.object({
      postId: z.string(),
      kind: z.enum(["post", "status"]),
      authorProfileId: z.string().optional(),
      contentHash: z.string().optional(),
      topics: z.array(z.string()).optional(),
    }),
    atrium_probe: z.object({
      postId: z.string(),
      authorProfileId: z.string().optional(),
      topics: z.array(z.string()).optional(),
      stage: z.string().optional(),
      domains: z.array(z.string()).optional(),
      engagementType: z.string().optional(),
    }),
  },
  edgeLabels: {
    authored_by: z.object({}),
  },
});
