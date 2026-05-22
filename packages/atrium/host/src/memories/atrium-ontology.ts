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
  },
  edgeLabels: {
    authored_by: z.object({}),
  },
});
