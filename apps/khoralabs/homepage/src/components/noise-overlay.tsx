import { type ComponentProps, type CSSProperties, useId } from "react";

import { cn } from "@/lib/utils";

export type NoiseOverlayProps = Omit<ComponentProps<"svg">, "style"> & {
  style?: CSSProperties;
  /** Alpha of the grain layer (max 1). Pair with `grainContrast` / `mixBlendMode` if this alone isn’t enough. */
  noiseOpacity?: number;
  /**
   * CSS mix-blend-mode for the overlay. `soft-light` is subtle; `overlay` / `hard-light` read much stronger.
   * @default "overlay"
   */
  mixBlendMode?: CSSProperties["mixBlendMode"];
  /**
   * Amplifies turbulence contrast before blending (`feComponentTransfer` linear slope). Try 1.6–2.5 when opacity is already 1.
   * @default 1.55
   */
  grainContrast?: number;
  /** `feTurbulence` baseFrequency (number or `"x y"`). Higher ≈ finer grain. */
  baseFrequency?: number | string;
  /** `feTurbulence` detail octaves. */
  numOctaves?: number;
};

export function NoiseOverlay({
  className,
  style,
  "aria-hidden": ariaHidden,
  noiseOpacity = 0.42,
  mixBlendMode,
  grainContrast = 1.55,
  baseFrequency = 1.05,
  numOctaves = 5,
  ...props
}: NoiseOverlayProps) {
  const id = useId().replace(/:/g, "");
  const filterId = `grain-${id}`;
  const contrast =
    typeof grainContrast === "number" && Math.abs(grainContrast - 1) > 0.001 ? grainContrast : null;
  const bf = typeof baseFrequency === "number" ? String(baseFrequency) : baseFrequency;

  const slope = contrast ?? 1;
  const intercept = -(slope - 1) / 2;

  return (
    <svg
      {...props}
      aria-hidden={ariaHidden ?? true}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pointer-events-none fixed inset-0 z-[1] h-full w-full", className)}
      style={{
        ...style,
        mixBlendMode: mixBlendMode ?? style?.mixBlendMode ?? "overlay",
      }}
    >
      <title>Grain texture overlay</title>
      <defs>
        <filter
          id={filterId}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency={bf}
            numOctaves={numOctaves}
            stitchTiles="stitch"
            result="noise"
          />
          {contrast !== null ? (
            <feComponentTransfer in="noise" result="noiseContrast">
              <feFuncR type="linear" slope={slope} intercept={intercept} />
              <feFuncG type="linear" slope={slope} intercept={intercept} />
              <feFuncB type="linear" slope={slope} intercept={intercept} />
            </feComponentTransfer>
          ) : null}
        </filter>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="#fff"
        filter={`url(#${filterId})`}
        opacity={noiseOpacity}
      />
    </svg>
  );
}
