export type FlowField = {
  id: string;
  prompt: string;
  optional?: boolean;
};

/** Linear questionnaire definition (ordered fields). */
export type FlowDefinition = {
  id: string;
  fields: readonly FlowField[];
};
