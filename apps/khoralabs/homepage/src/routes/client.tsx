import { useState } from "react";

import { SiteLayout } from "@/components/site-layout";
import { WaitlistSignup } from "@/components/waitlist-signup";
import {
  consumerLandingConfirmMessageClass,
  consumerLandingConfirmTitleClass,
  consumerLandingFooterClass,
  consumerLandingFooterLinkClass,
  consumerLandingHeaderClass,
  consumerLandingHeroEnterClass,
  consumerLandingHeroGridClass,
  consumerLandingMainClass,
  consumerLandingNavLinkClass,
  consumerLandingShellClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import logoUrl from "../assets/khora_logo_text_b.svg";
import { renderRoute } from "../render-route";
import "../../styles/globals.css";

function HomePage() {
  const [confirmed, setConfirmed] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <SiteLayout.Root className={consumerLandingShellClass}>
      <SiteLayout.ConsumerBackground />
      <SiteLayout.ConsumerBottomFade />
      <SiteLayout.Frame>
        <SiteLayout.Header className={consumerLandingHeaderClass}>
          <a
            href="/"
            onClick={() => {
              setConfirmed(false);
              setResetKey((k) => k + 1);
            }}
            className="block shrink-0 transition-opacity hover:opacity-80"
          >
            <img
              src={logoUrl}
              alt="khora"
              width={130}
              height={37}
              className="h-4 w-auto md:h-[1.2rem]"
            />
          </a>
          <nav aria-label="Primary">
            <ul className="m-0 flex list-none gap-8 p-0 md:gap-10">
              <li>
                <a href="/blog" className={consumerLandingNavLinkClass}>
                  Blog
                </a>
              </li>
              <li>
                <a href="/contact" className={consumerLandingNavLinkClass}>
                  Contact
                </a>
              </li>
            </ul>
          </nav>
        </SiteLayout.Header>
        <SiteLayout.Main className={consumerLandingMainClass}>
          <div className={consumerLandingHeroGridClass}>
            <div
              key={confirmed ? "confirmed" : "waitlist"}
              className={cn("relative z-10 text-left", consumerLandingHeroEnterClass)}
            >
              {confirmed ? (
                <>
                  <h1 className={consumerLandingConfirmTitleClass}>You&apos;re on the list.</h1>
                  <p className={consumerLandingConfirmMessageClass}>
                    We&apos;ll email you when a spot opens up.
                  </p>
                </>
              ) : (
                <WaitlistSignup resetKey={resetKey} onSuccess={() => setConfirmed(true)} />
              )}
            </div>
            <div aria-hidden className="hidden min-h-[280px] lg:block" />
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer className={consumerLandingFooterClass}>
          <p className="m-0">© 2026 Khora Labs</p>
          <p className="m-0">
            <a href="/terms" className={consumerLandingFooterLinkClass}>
              Terms of Service
            </a>
            <span aria-hidden className="px-1">
              ·
            </span>
            <a href="/privacy" className={consumerLandingFooterLinkClass}>
              Privacy Policy
            </a>
          </p>
        </SiteLayout.Footer>
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(HomePage);
