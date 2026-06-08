import type { ComponentProps } from "react";

import { NoiseOverlay } from "@/components/noise-overlay";
import { SiteNav } from "@/components/site-nav";
import { ASSETS } from "@/lib/asset-urls";
import {
  footerDefaultClass,
  footerLegalLinkClass,
  headerDefaultClass,
  mainDefaultClass,
  shellClass,
  siteLogoClass,
  siteNavLinkClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

function Root({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn(shellClass, className)} />;
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
    <header {...props} className={cn(headerDefaultClass, className)}>
      {children ?? (
        <>
          <a href="/" className="block shrink-0 transition-opacity hover:opacity-80">
            <img
              src={ASSETS.logoWhite}
              alt="khora"
              width={130}
              height={37}
              className={siteLogoClass}
            />
          </a>
          <SiteNav linkClassName={siteNavLinkClass} />
        </>
      )}
    </header>
  );
}

function Main({ className, ...props }: ComponentProps<"main">) {
  return <main {...props} className={cn(mainDefaultClass, className)} />;
}

function Footer({ className, children, ...props }: ComponentProps<"footer">) {
  return (
    <footer {...props} className={cn(footerDefaultClass, className)}>
      {children ?? (
        <>
          <p className="m-0">© 2026 khora labs</p>
          <ul className="m-0 flex list-none gap-6 p-0 md:gap-8">
            <li>
              <a href="/terms" className={footerLegalLinkClass}>
                Terms of Service
              </a>
            </li>
            <li>
              <a href="/privacy" className={footerLegalLinkClass}>
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
