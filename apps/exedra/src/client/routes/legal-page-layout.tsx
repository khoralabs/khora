import type { ReactNode } from "react";

import { ExedraBrand } from "@/components/brand/khora-logo";
import { Button } from "@/components/ui/button";

type LegalPageLayoutProps = {
  title: string;
  effectiveDate: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPageLayout({
  title,
  effectiveDate,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <ExedraBrand />
          <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Effective date: {effectiveDate} · Last updated: {lastUpdated}
          </p>
        </div>
        <article className="space-y-6 text-sm leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1">
          {children}
        </article>
      </main>
    </div>
  );
}
