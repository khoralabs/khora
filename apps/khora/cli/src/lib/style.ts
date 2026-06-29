import { style as baseStyle, pc, symbols } from "@khoralabs/cli-kit";

/** Khora CLI styling — brand accent is blue (not Bun stderr red). */
export const style = {
  ...baseStyle,
  brand: (s: string): string => pc.blue(s),
  error: (s: string): string => pc.blue(s),
};

export { pc, symbols };
