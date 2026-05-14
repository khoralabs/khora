import { ArrowUpRight, Newspaper } from "lucide-react";

import { SiteLayout } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function BlogPage() {
  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-center items-center">
          <Empty className="max-w-xl border border-[#F4F4EF]/20 bg-[#F4F4EF]/[0.04] text-[#F4F4EF]">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-[#F4F4EF]/12 text-[#F4F4EF]">
                <Newspaper />
              </EmptyMedia>
              <EmptyTitle className="text-[#F4F4EF]">No posts yet</EmptyTitle>
              <EmptyDescription className="text-[#F4F4EF]/75">
                Writing from the lab will land here. Until then, reach out if you&apos;d like to
                collaborate.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <Button asChild className="bg-[#F4F4EF] text-[#3F3F3F] hover:bg-[#F4F4EF]/90">
                <a href="/contact">Get in touch</a>
              </Button>
              <Button
                variant="outline"
                asChild
                className="border-[#F4F4EF]/45 bg-transparent text-[#F4F4EF] hover:bg-[#F4F4EF]/10"
              >
                <a href="/">Home</a>
              </Button>
            </EmptyContent>
            <Button variant="link" asChild className="text-[#F4F4EF]/65" size="sm">
              <a href="/contact">
                Learn more <ArrowUpRight />
              </a>
            </Button>
          </Empty>
        </SiteLayout.Main>
        <SiteLayout.Footer />
      </SiteLayout.Frame>
    </SiteLayout.Root>
  );
}

renderRoute(BlogPage);
