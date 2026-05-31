import type {
  RegistrationPolicy,
  RegistrationRequirementId,
  RegistrationRequirementState,
  RegistrationTrustLevel,
} from "@khoralabs/registry-catalog-contracts";

export type {
  RegistrationPolicy,
  RegistrationRequirementId,
  RegistrationRequirementState,
  RegistrationRequirementStatus,
  RegistrationTrustLevel,
} from "@khoralabs/registry-catalog-contracts";

const ALL_REQUIREMENT_IDS: RegistrationRequirementId[] = [
  "health_check",
  "operator_approval",
  "payment",
];

export function parseRegistrationTrustLevel(raw: string | undefined): RegistrationTrustLevel {
  const v = raw?.trim().toLowerCase();
  if (v === "health" || v === "open") {
    return v;
  }
  return "manual";
}

export function registrationPolicyForTrustLevel(
  trustLevel: RegistrationTrustLevel,
): RegistrationPolicy {
  if (trustLevel === "manual") {
    return {
      trustLevel,
      required: ["health_check", "operator_approval"],
      autoActivateWhen: [],
    };
  }
  return {
    trustLevel,
    required: ["health_check"],
    autoActivateWhen: ["health_check"],
  };
}

export function readRegistrationPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RegistrationPolicy {
  const trustLevel = parseRegistrationTrustLevel(env.REGISTRY_REGISTRATION_TRUST);
  const overrideRaw = env.REGISTRY_REGISTRATION_REQUIREMENTS?.trim();
  if (overrideRaw === undefined || overrideRaw.length === 0) {
    return registrationPolicyForTrustLevel(trustLevel);
  }
  try {
    const parsed = JSON.parse(overrideRaw) as {
      trustLevel?: RegistrationTrustLevel;
      required?: RegistrationRequirementId[];
      autoActivateWhen?: RegistrationRequirementId[];
    };
    const level = parsed.trustLevel ?? trustLevel;
    const base = registrationPolicyForTrustLevel(level);
    return {
      trustLevel: level,
      required: parsed.required ?? base.required,
      autoActivateWhen: parsed.autoActivateWhen ?? base.autoActivateWhen,
    };
  } catch {
    return registrationPolicyForTrustLevel(trustLevel);
  }
}

export function initializeRegistrationRequirements(
  policy: RegistrationPolicy,
): RegistrationRequirementState[] {
  return policy.required.map((id) => ({
    id,
    status: id === "payment" ? "pending" : "pending",
    ...(id === "payment" ? { detail: "Payment verification not implemented" } : {}),
  }));
}

export function parseRegistrationRequirements(raw: string | null): RegistrationRequirementState[] {
  if (raw === null || raw.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as RegistrationRequirementState[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is RegistrationRequirementState =>
        typeof item === "object" &&
        item !== null &&
        ALL_REQUIREMENT_IDS.includes(item.id) &&
        (item.status === "pending" ||
          item.status === "satisfied" ||
          item.status === "failed" ||
          item.status === "waived"),
    );
  } catch {
    return [];
  }
}

export function serializeRegistrationRequirements(states: RegistrationRequirementState[]): string {
  return JSON.stringify(states);
}

export function updateRegistrationRequirement(
  states: RegistrationRequirementState[],
  id: RegistrationRequirementId,
  update: Partial<Pick<RegistrationRequirementState, "status" | "checkedAtMs" | "detail">>,
): RegistrationRequirementState[] {
  return states.map((state) =>
    state.id === id
      ? {
          ...state,
          ...update,
          ...(update.status !== undefined || update.detail !== undefined
            ? { checkedAtMs: update.checkedAtMs ?? Date.now() }
            : {}),
        }
      : state,
  );
}

export function allAutoActivateRequirementsMet(
  states: RegistrationRequirementState[],
  policy: RegistrationPolicy,
): boolean {
  if (policy.autoActivateWhen.length === 0) {
    return false;
  }
  return policy.autoActivateWhen.every((id) => {
    const state = states.find((item) => item.id === id);
    return state !== undefined && (state.status === "satisfied" || state.status === "waived");
  });
}

export function registrationRequirementsSummary(states: RegistrationRequirementState[]): {
  pending: number;
  failed: number;
  satisfied: number;
} {
  let pending = 0;
  let failed = 0;
  let satisfied = 0;
  for (const state of states) {
    if (state.status === "failed") {
      failed += 1;
    } else if (state.status === "satisfied" || state.status === "waived") {
      satisfied += 1;
    } else {
      pending += 1;
    }
  }
  return { pending, failed, satisfied };
}
