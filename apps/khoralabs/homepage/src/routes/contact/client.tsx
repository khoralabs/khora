import { useState } from "react";

import { SiteLayout } from "@/components/site-layout";
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
            <h1 className="text-balance text-2xl font-normal leading-tight md:text-3xl">Contact</h1>
            <p className="mt-4 text-pretty text-sm leading-relaxed text-[#F4F4EF]/90 md:text-[15px] md:leading-[1.55]">
              Send a note with your email and we&apos;ll get back to you.
            </p>

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
                    className="w-full resize-y rounded border border-[#F4F4EF]/35 bg-[#3F3F3F]/80 px-3 py-2.5 text-sm text-[#F4F4EF] outline-none ring-[#F4F4EF]/40 placeholder:text-[#F4F4EF]/40 focus:border-[#F4F4EF]/60 focus:ring-2 md:text-[15px]"
                    placeholder="How can we help?"
                  />
                </div>
                <button
                  type="submit"
                  className="self-start rounded border border-[#F4F4EF]/50 bg-transparent px-5 py-2.5 text-sm transition-colors hover:bg-[#F4F4EF]/10 md:text-[15px]"
                >
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
