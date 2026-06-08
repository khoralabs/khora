import { MdxAgreement } from "@/components/post";
import { SiteLayout } from "@/components/site-layout";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";
import PrivacyDocument from "./privacy-policy.md";

export function PrivacyPage() {
  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-start">
          <div className="mx-auto w-full max-w-3xl">
            <MdxAgreement Content={PrivacyDocument} />
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

if (typeof document !== "undefined") {
  renderRoute(PrivacyPage);
}
