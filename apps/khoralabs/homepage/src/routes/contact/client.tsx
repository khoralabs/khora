import { ContactForm } from "@/components/contact-form";
import { MutedBody } from "@/components/muted-body";
import { PageTitle } from "@/components/page-title";
import { SiteLayout } from "@/components/site-layout";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

export function ContactPage() {
  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-start md:justify-center">
          <div className="mx-auto w-full max-w-lg">
            <PageTitle>Contact</PageTitle>
            <MutedBody className="mt-4">
              Send a note with your email and we&apos;ll get back to you.
            </MutedBody>
            <ContactForm />
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

if (typeof document !== "undefined") {
  renderRoute(ContactPage);
}
