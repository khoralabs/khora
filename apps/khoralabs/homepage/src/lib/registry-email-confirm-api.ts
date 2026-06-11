import { createRegistryEmailConfirmApi } from "@khoralabs/registry-auth/client";

import { getRegistryUrl } from "@/lib/registry-url";

export const registryEmailConfirmApi = createRegistryEmailConfirmApi({
  registryUrl: getRegistryUrl(),
  sourceApp: "khoralabs-homepage",
});
