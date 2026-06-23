import type { AuthzClient } from "../authz-client.ts";
import type { GenerateResponseWorkflowParams } from "../types.ts";

export async function evaluateDocumentReadAccess(
  params: GenerateResponseWorkflowParams,
  authz: AuthzClient,
): Promise<string[]> {
  const subject = params.agent.actingFor;
  return (
    await Promise.all(
      (params.access.documentIds ?? []).map(async (documentId) =>
        (await authz.canReadDocument(subject, documentId)) ? documentId : null,
      ),
    )
  ).filter((documentId): documentId is string => documentId !== null);
}
