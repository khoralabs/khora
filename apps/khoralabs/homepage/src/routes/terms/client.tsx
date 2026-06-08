import { MdxAgreement } from "@/components/post";
import { SiteLayout } from "@/components/site-layout";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";
import TermsDocument from "./terms-of-service.md";

export function TermsPage() {
  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-start">
          <div className="mx-auto w-full max-w-3xl">
            <MdxAgreement Content={TermsDocument} />
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

if (typeof document !== "undefined") {
  renderRoute(TermsPage);
}
