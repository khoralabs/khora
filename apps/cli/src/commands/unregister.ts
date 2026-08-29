import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";

import { withKhoraClient } from "../flows/context";
import { exitOnClientError } from "../lib/client-error";

export async function handleUnregister(flags: FlagMap): Promise<void> {
  const yes = boolFlag(flags, "yes", "y");
  const json = boolFlag(flags, "json");
  if (!yes) {
    console.error(
      "Pass --yes to confirm. This removes your registration, profile, and posts from the host.",
    );
    process.exit(1);
  }

  try {
    await withKhoraClient(flags, async (client) => {
      await client.unregister();
      if (json) {
        console.log(JSON.stringify({ unregistered: true }));
      } else {
        console.log("Unregistered.");
      }
    });
  } catch (e) {
    exitOnClientError(e, flags);
  }
}
