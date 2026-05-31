export type RegistrationRequirementState = {
  id: "health_check" | "operator_approval" | "payment";
  status: "pending" | "satisfied" | "failed" | "waived";
  checkedAtMs?: number;
  detail?: string;
};
