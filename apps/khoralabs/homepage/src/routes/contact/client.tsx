import { useState } from "react";

import { SiteLayout } from "@/components/site-layout";
import {
  fieldTypographyMuted,
  inputControlClass,
  labelTypography,
  outlineSubmitButtonClass,
  pageTitleClass,
  statusTypography,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-start md:justify-center">
          <div className="mx-auto w-full max-w-lg">
            <h1 className={pageTitleClass}>Contact</h1>
            <p className={`mt-4 ${fieldTypographyMuted}`}>
              Send a note with your email and we&apos;ll get back to you.
            </p>

            {submitted ? (
              <p className={`mt-10 ${statusTypography}`} role="status">
                Thanks for your message.
              </p>
            ) : (
              <form
                className="mt-10 flex flex-col gap-6 text-left"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(true);
                }}
              >
                <div className="flex flex-col gap-2">
                  <label htmlFor="email" className={labelTypography}>
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className={inputControlClass}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="message" className={labelTypography}>
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    className={cn(inputControlClass, "resize-y")}
                    placeholder="How can we help?"
                  />
                </div>
                <button type="submit" className={outlineSubmitButtonClass}>
                  Send
                </button>
              </form>
            )}
          </div>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(ContactPage);
