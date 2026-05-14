import { InviteEmailForm } from "@/components/invite-email-form";
import { SiteLayout } from "@/components/site-layout";
import { fieldTypography, heroTitleClass } from "@/lib/ui-styles";
import { renderRoute } from "../render-route";
import "../../styles/globals.css";

function HomePage() {
  return (
    <SiteLayout.Root>
      {/* <SiteLayout.BackgroundImage /> */}
      <SiteLayout.Noise noiseOpacity={1} />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main>
          <div className="ml-auto w-full max-w-[64rem] px-32 py-16 text-right">
            <h1 className={heroTitleClass}>AI research and products for new human connections</h1>
            <p className={`mt-8 ${fieldTypography}`}>
              We&apos;re quietly collaborating with people at the forefront of technology.
            </p>
            <InviteEmailForm />
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(HomePage);
