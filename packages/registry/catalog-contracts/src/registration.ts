export type RegistrationRequirementId = "health_check" | "operator_approval" | "payment";

export type RegistrationRequirementStatus = "pending" | "satisfied" | "failed" | "waived";

export type RegistrationTrustLevel = "manual" | "health" | "open";

export type RegistrationRequirementState = {
  id: RegistrationRequirementId;
  status: RegistrationRequirementStatus;
  checkedAtMs?: number;
  detail?: string;
};

export type RegistrationPolicy = {
  trustLevel: RegistrationTrustLevel;
  required: RegistrationRequirementId[];
  autoActivateWhen: RegistrationRequirementId[];
};
