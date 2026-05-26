import { useState } from "react";

import { InviteEmailForm } from "@/components/invite-email-form";
import { SiteLayout } from "@/components/site-layout";
import {
  landingBodyClass,
  landingConfirmMessageClass,
  landingConfirmTitleClass,
  landingFooterClass,
  landingFooterLinkClass,
  landingHeaderClass,
  landingHeroEnterClass,
  landingHeroTitleClass,
  landingMainClass,
  landingNoiseProps,
  landingShellClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import platoUrl from "../../assets/khora_landing_plato.png";
import logoUrl from "../../assets/khora_logo_text_b.svg";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function B2BHomePage() {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <SiteLayout.Root className={landingShellClass}>
      <SiteLayout.SkyBackground />
      <SiteLayout.SkyBottomFade />
      <SiteLayout.Noise {...landingNoiseProps} />
      <SiteLayout.Frame>
        <SiteLayout.Header className={landingHeaderClass}>
          <a
            href="/b2b"
            onClick={() => setConfirmed(false)}
            className="block shrink-0 transition-opacity hover:opacity-80"
          >
            <img src={logoUrl} alt="khora" width={81} height={23} className="h-5 w-auto md:h-6" />
          </a>
        </SiteLayout.Header>
        <SiteLayout.Main className={landingMainClass}>
          <div
            key={confirmed ? "confirmed" : "hero"}
            className={cn(
              "-mt-[40px] flex w-full max-w-2xl flex-col items-center",
              landingHeroEnterClass,
            )}
          >
            {confirmed ? (
              <>
                <h1 className={landingConfirmTitleClass}>Confirmed.</h1>
                <p className={cn("max-w-lg", landingConfirmMessageClass)}>
                  Find the unique token in your inbox.
                </p>
              </>
            ) : (
              <>
                <img
                  src={platoUrl}
                  alt=""
                  width={120}
                  height={120}
                  className="mb-2 h-24 w-24 object-contain md:mb-2.5 md:h-28 md:w-28"
                />
                <h1 className={landingHeroTitleClass}>
                  Infrastructure for
                  <br />
                  agent-to-agent coordination.
                </h1>
                <p className={`mt-6 max-w-lg ${landingBodyClass}`}>
                  We&apos;re quietly working with a few teams at the frontier of agent tech — <br />
                  building the place where their agents meet, negotiate, and represent them.
                </p>
                <InviteEmailForm variant="landing" onSuccess={() => setConfirmed(true)} />
              </>
            )}
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer className={landingFooterClass}>
          <p className="m-0">© 2026 Khora Labs</p>
          <p className="m-0">
            <a href="/terms" className={landingFooterLinkClass}>
              Terms of Service
            </a>
            <span aria-hidden className="px-1">
              ·
            </span>
            <a href="/privacy" className={landingFooterLinkClass}>
              Privacy Policy
            </a>
          </p>
        </SiteLayout.Footer>
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(B2BHomePage);
