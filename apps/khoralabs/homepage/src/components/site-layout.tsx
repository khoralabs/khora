import type { ComponentProps } from "react";

import { NoiseOverlay } from "@/components/noise-overlay";
import { cn } from "@/lib/utils";

import handsBg from "../assets/hands.png";
import logoUrl from "../assets/khora_logo_text_w.svg";

const shellClass =
  "relative min-h-dvh bg-[#3F3F3F] font-[Helvetica_Neue,Helvetica,Arial,sans-serif] tracking-[-0.01em] text-[#F4F4EF] antialiased";

const mainDefaultClass = "flex flex-1 flex-col px-6 py-16 md:px-10 md:py-20";

const headerDefaultClass = "flex shrink-0 items-start justify-between px-6 pt-8 md:px-10 md:pt-10";

const footerDefaultClass =
  "flex shrink-0 flex-wrap items-end justify-between gap-6 px-6 pb-8 pt-4 text-[11px] text-[#F4F4EF]/85 md:px-10 md:pb-10 md:text-xs";

const navLinkClass =
  "text-sm text-[#F4F4EF] no-underline transition-opacity hover:opacity-75 md:text-[15px]";

function Root({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn(shellClass, className)} />;
}

function BackgroundImage({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat", className)}
      style={{ backgroundImage: `url(${handsBg})`, ...style }}
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
            <img src={logoUrl} alt="khora" width={162} height={46} className="h-4 w-auto md:h-6" />
          </a>
          <nav aria-label="Primary">
            <ul className="flex gap-8 md:gap-10">
              <li>
                <a href="/" className={navLinkClass}>
                  Blog
                </a>
              </li>
              <li>
                <a href="/contact" className={navLinkClass}>
                  Contact
                </a>
              </li>
            </ul>
          </nav>
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
              <a href="/" className="text-inherit no-underline transition-opacity hover:opacity-75">
                Terms of Services
              </a>
            </li>
            <li>
              <a href="/" className="text-inherit no-underline transition-opacity hover:opacity-75">
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
  Noise,
  Frame,
  Header,
  Main,
  Footer,
};
