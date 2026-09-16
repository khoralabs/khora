import type { FanOutJob, FanOutPolicy } from "../persistence/core/port";

export function assertFanOutPlanningInput(input: {
  visibility: string;
  fanOutPolicy: FanOutPolicy;
}): void {
  const { mode } = input.fanOutPolicy;
  if (mode === "push") return;
  if (input.visibility !== "public") {
    throw new Error("catalog-pull and hybrid fan-out require public catalog visibility");
  }
}

export function selectFanOutDeliveryMode(
  job: Pick<FanOutJob, "visibility" | "fanOutPolicy">,
  plannedTargetCount: number,
): "push" | "pull" {
  if (job.visibility === "network") return "push";
  if (job.fanOutPolicy.mode === "catalog-pull") return "pull";
  if (
    job.fanOutPolicy.mode === "hybrid" &&
    plannedTargetCount > job.fanOutPolicy.publicPushTargetLimit
  ) {
    return "pull";
  }
  return "push";
}

export function fanOutPolicyMode(policy: FanOutPolicy): FanOutPolicy["mode"] {
  return policy.mode;
}

export function fanOutPolicyLimit(policy: FanOutPolicy): number | null {
  return policy.mode === "hybrid" ? policy.publicPushTargetLimit : null;
}

export function fanOutPolicyFromColumns(
  mode: string,
  publicPushTargetLimit: number | null,
): FanOutPolicy {
  if (mode === "catalog-pull") return { mode: "catalog-pull" };
  if (mode === "hybrid") {
    const limit = publicPushTargetLimit ?? 0;
    return { mode: "hybrid", publicPushTargetLimit: Math.max(1, limit) };
  }
  return { mode: "push" };
}
