/** `{ version: "1", properties: [...] }` JSON persisted on {@link Port.bind_policy}. */

export type PortBindPolicyVersion = "1";

export type BindPolicyTextField = {
  type: "text";
  name: string;
  prompt: string;
  optional?: boolean;
  constraints?: {
    minLength?: number;
    maxLength?: number;
  };
};

export type BindPolicyBooleanField = {
  type: "boolean";
  name: string;
  prompt: string;
  optional?: boolean;
};

export type BindPolicyIntField = {
  type: "int";
  name: string;
  prompt: string;
  optional?: boolean;
  constraints?: {
    min?: number;
    max?: number;
  };
};

export type BindPolicyFloatField = {
  type: "float";
  name: string;
  prompt: string;
  optional?: boolean;
  constraints?: {
    min?: number;
    max?: number;
  };
};

export type BindPolicyChoiceField = {
  type: "choice";
  name: string;
  prompt: string;
  optional?: boolean;
  constraints: {
    choices: string[];
    /** Default 1 (single enum value). When greater than 1, value is an array of choices. */
    maxSelections?: number;
  };
};

export type BindPolicyField =
  | BindPolicyTextField
  | BindPolicyBooleanField
  | BindPolicyIntField
  | BindPolicyFloatField
  | BindPolicyChoiceField;

export type PortBindPolicy = {
  version: PortBindPolicyVersion;
  properties: BindPolicyField[];
};
