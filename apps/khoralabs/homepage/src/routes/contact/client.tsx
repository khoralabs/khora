import { useState } from "react";

import { MutedBody } from "@/components/muted-body";
import { PageTitle } from "@/components/page-title";
import { SiteLayout } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

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

            {submitted ? (
              <p className="mt-10 text-sm text-[#F4F4EF]/85 md:text-[15px]" role="status">
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
                  <label htmlFor="email" className="text-sm md:text-[15px]">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="w-full rounded border border-[#F4F4EF]/35 bg-[#3F3F3F]/80 px-3 py-2.5 text-sm text-[#F4F4EF] outline-none ring-[#F4F4EF]/40 placeholder:text-[#F4F4EF]/40 focus:border-[#F4F4EF]/60 focus:ring-2 md:text-[15px]"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="message" className="text-sm md:text-[15px]">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    className={cn(
                      "w-full rounded border border-[#F4F4EF]/35 bg-[#3F3F3F]/80 px-3 py-2.5 text-sm text-[#F4F4EF] outline-none ring-[#F4F4EF]/40 placeholder:text-[#F4F4EF]/40 focus:border-[#F4F4EF]/60 focus:ring-2 md:text-[15px]",
                      "resize-y",
                    )}
                    placeholder="How can we help?"
                  />
                </div>
                <Button type="submit" variant="shell-outline" className="self-start md:text-[15px]">
                  Send
                </Button>
              </form>
            )}
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
