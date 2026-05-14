import { Loader } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { SiteLayout } from "@/components/site-layout";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { renderRoute } from "../render-route";
import "../../styles/globals.css";

const fieldTypography = "text-pretty text-sm leading-relaxed md:text-[15px] md:leading-[1.55]";

function InviteEmailForm() {
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={`mt-3 ml-auto block w-full max-w-md ${fieldTypography}`}
      onSubmit={onSubmit}
      aria-busy={pending}
    >
      <InputGroup
        className="h-10 border-[#F4F4EF]/35 bg-[#3F3F3F]/80 text-[#F4F4EF] shadow-none ring-[#F4F4EF]/30 focus-within:border-[#F4F4EF]/55 focus-within:ring-[#F4F4EF]/25 dark:bg-[#3F3F3F]/80"
        {...(pending ? { "data-disabled": true as const } : {})}
      >
        <InputGroupInput
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          placeholder="Request an invite token"
          aria-label="Request an invite token"
          className="placeholder:text-[#F4F4EF]/40 md:text-[15px]"
        />
        <InputGroupAddon align="inline-end" className="text-[#F4F4EF]">
          <InputGroupButton
            type="submit"
            disabled={pending}
            variant="ghost"
            size="sm"
            className="text-[#F4F4EF] hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF]"
            aria-label={pending ? "Sending request" : "Submit invite request"}
          >
            {pending ? <Loader className="size-4 animate-spin" aria-hidden /> : "Submit"}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

function HomePage() {
  return (
    <SiteLayout.Root>
      {/* <SiteLayout.BackgroundImage /> */}
      <SiteLayout.Noise noiseOpacity={1} />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main>
          <div className="ml-auto w-full max-w-[64rem] px-32 py-16 text-right">
            <h1 className="text-balance text-3xl font-normal leading-[1.15] md:text-4xl lg:text-[2.65rem] lg:leading-[1.12]">
              AI research and products for new human connections
            </h1>
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
