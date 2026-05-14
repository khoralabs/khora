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
import {
  ctaLinkMutedClass,
  ctaOutlineOnDarkClass,
  ctaSolidOnDarkClass,
  emptyStateDescriptionClass,
  emptyStateIconWrapClass,
  emptyStatePanelClass,
  emptyStateTitleClass,
} from "@/lib/ui-styles";
import { renderRoute } from "../../render-route";
import "../../../styles/globals.css";

function BlogPage() {
  return (
    <SiteLayout.Root>
      <SiteLayout.Noise />
      <SiteLayout.Frame>
        <SiteLayout.Header />
        <SiteLayout.Main className="justify-center items-center">
          <Empty className={emptyStatePanelClass}>
            <EmptyHeader>
              <EmptyMedia variant="icon" className={emptyStateIconWrapClass}>
                <Newspaper />
              </EmptyMedia>
              <EmptyTitle className={emptyStateTitleClass}>No posts yet</EmptyTitle>
              <EmptyDescription className={emptyStateDescriptionClass}>
                Writing from the lab will land here. Until then, reach out if you&apos;d like to
                collaborate.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              <Button asChild className={ctaSolidOnDarkClass}>
                <a href="/contact">Get in touch</a>
              </Button>
              <Button variant="outline" asChild className={ctaOutlineOnDarkClass}>
                <a href="/">Home</a>
              </Button>
            </EmptyContent>
            <Button variant="link" asChild className={ctaLinkMutedClass} size="sm">
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
