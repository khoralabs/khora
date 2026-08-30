import "./otel.js";

import { registryHtmlRoutes } from "./html-routes";
import { runRegistryServer } from "./run-registry-server";

await runRegistryServer({ htmlRoutes: registryHtmlRoutes });
