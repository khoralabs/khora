import type { ComponentProps } from "react";

import { NoiseOverlay } from "@/components/noise-overlay";
import { SiteNav } from "@/components/site-nav";
import { ASSETS } from "@/lib/asset-urls";
import { cn } from "@/lib/utils";

function Root({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cn(
        "relative min-h-dvh bg-[#3F3F3F] font-[Helvetica_Neue,Helvetica,Arial,sans-serif] tracking-[-0.01em] text-[#F4F4EF] antialiased",
        className,
      )}
    />
  );
}

function BackgroundImage({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat", className)}
      style={{ backgroundImage: `url(${ASSETS.hands})`, ...style }}
    />
  );
}

function SkyBackground({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat", className)}
      style={{ backgroundImage: `url(${ASSETS.sky})`, ...style }}
    />
  );
}

function ConsumerBackground({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 overflow-hidden bg-[#E2E2E2]", className)}
    >
      <img
        src={ASSETS.consumerMesh}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <img
        src={ASSETS.consumerHands}
        alt=""
        className="absolute top-0 left-1/2 h-dvh w-auto max-w-none -translate-x-1/2 object-contain object-center opacity-30 md:translate-x-[calc(-50%+200px)] lg:left-auto lg:right-0 lg:translate-x-[100px] lg:object-right"
      />
    </div>
  );
}

function ConsumerBottomFade({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-[32vh] bg-gradient-to-t from-white to-transparent",
        className,
      )}
    />
  );
}

function SkyBottomFade({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-[42vh] bg-gradient-to-t from-[#ffffff] to-transparent",
        className,
      )}
    />
  );
}

function Noise(props: ComponentProps<typeof NoiseOverlay>) {
  return <NoiseOverlay {...props} />;
}

function Frame({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("relative z-10 flex min-h-dvh flex-col", className)} />;
}

function Header({ className, children, ...props }: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={cn(
        "flex shrink-0 items-start justify-between px-6 pt-8 md:px-10 md:pt-10",
        className,
      )}
    >
      {children ?? (
        <>
          <a href="/" className="block shrink-0 transition-opacity hover:opacity-80">
            <img
              src={ASSETS.logoWhite}
              alt="khora"
              width={130}
              height={37}
              className="h-4 w-auto md:h-[1.2rem]"
            />
          </a>
          <SiteNav />
        </>
      )}
    </header>
  );
}

function Main({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      {...props}
      className={cn("flex flex-1 flex-col px-6 py-16 md:px-10 md:py-20", className)}
    />
  );
}

function Footer({ className, children, ...props }: ComponentProps<"footer">) {
  return (
    <footer
      {...props}
      className={cn(
        "flex shrink-0 flex-wrap items-end justify-between gap-6 px-6 pb-8 pt-4 text-[11px] text-[#F4F4EF]/85 md:px-10 md:pb-10 md:text-xs",
        className,
      )}
    >
      {children ?? (
        <>
          <p className="m-0">© 2026 khora labs</p>
          <ul className="m-0 flex list-none gap-6 p-0 md:gap-8">
            <li>
              <a
                href="/terms"
                className="text-inherit no-underline transition-opacity hover:opacity-75"
              >
                Terms of Service
              </a>
            </li>
            <li>
              <a
                href="/privacy"
                className="text-inherit no-underline transition-opacity hover:opacity-75"
              >
                Privacy Policy
              </a>
            </li>
          </ul>
        </>
      )}
    </footer>
  );
}

/** Compose shells & chrome with native props (`className`, etc.) on each slot. */
export const SiteLayout = {
  Root,
  BackgroundImage,
  SkyBackground,
  ConsumerBackground,
  ConsumerBottomFade,
  SkyBottomFade,
  Noise,
  Frame,
  Header,
  Main,
  Footer,
};
