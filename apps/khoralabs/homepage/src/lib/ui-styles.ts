/**
 * Shared Tailwind class strings for the Khora homepage dark shell (#3F3F3F / #F4F4EF).
 * Prefer importing from here instead of duplicating long composites.
 */

// --- Layout shell (SiteLayout) ---

export const shellClass =
  "relative min-h-dvh bg-[#3F3F3F] font-[Helvetica_Neue,Helvetica,Arial,sans-serif] tracking-[-0.01em] text-[#F4F4EF] antialiased";

export const mainDefaultClass = "flex flex-1 flex-col px-6 py-16 md:px-10 md:py-20";

export const headerDefaultClass =
  "flex shrink-0 items-start justify-between px-6 pt-8 md:px-10 md:pt-10";

export const footerDefaultClass =
  "flex shrink-0 flex-wrap items-end justify-between gap-6 px-6 pb-8 pt-4 text-[11px] text-[#F4F4EF]/85 md:px-10 md:pb-10 md:text-xs";

export const footerLegalLinkClass = "text-inherit no-underline transition-opacity hover:opacity-75";

// --- Typography ---

/** Primary body copy: intro paragraphs, form context, etc. */
export const fieldTypography =
  "text-pretty text-sm leading-relaxed md:text-[15px] md:leading-[1.55]";

/** Body copy with slight fade (secondary paragraphs on charcoal). */
export const fieldTypographyMuted =
  "text-pretty text-sm leading-relaxed text-[#F4F4EF]/90 md:text-[15px] md:leading-[1.55]";

/** Form labels and static field labels. */
export const labelTypography = "text-sm md:text-[15px]";

/** Success / status lines after submit. */
export const statusTypography = "text-sm text-[#F4F4EF]/85 md:text-[15px]";

/** Home hero headline. */
export const heroTitleClass =
  "text-balance text-3xl font-normal leading-[1.15] md:text-4xl lg:text-[2.65rem] lg:leading-[1.12]";

/** Inner page H1 (contact, etc.). */
export const pageTitleClass = "text-balance text-2xl font-normal leading-tight md:text-3xl";

/** Header nav links (Blog, Contact). */
export const navLinkClass =
  "text-sm text-[#F4F4EF] no-underline transition-opacity hover:opacity-75 md:text-[15px]";

// --- Forms ---

/** Native text inputs and textareas on the dark shell. */
export const inputControlClass =
  "w-full rounded border border-[#F4F4EF]/35 bg-[#3F3F3F]/80 px-3 py-2.5 text-sm text-[#F4F4EF] outline-none ring-[#F4F4EF]/40 placeholder:text-[#F4F4EF]/40 focus:border-[#F4F4EF]/60 focus:ring-2 md:text-[15px]";

/** Primary outline submit on dark (contact form). */
export const outlineSubmitButtonClass =
  "self-start rounded border border-[#F4F4EF]/50 bg-transparent px-5 py-2.5 text-sm transition-colors hover:bg-[#F4F4EF]/10 md:text-[15px]";

/** shadcn InputGroup chrome for invite email row. */
export const inputGroupShellClass =
  "h-10 border-[#F4F4EF]/35 bg-[#3F3F3F]/80 text-[#F4F4EF] shadow-none ring-[#F4F4EF]/30 focus-within:border-[#F4F4EF]/55 focus-within:ring-[#F4F4EF]/25 dark:bg-[#3F3F3F]/80";

/** Input text + placeholder inside InputGroup on dark shell. */
export const inputGroupInnerTypography = "placeholder:text-[#F4F4EF]/40 md:text-[15px]";

/** Muted text on InputGroup addon (icons / end slot). */
export const inputGroupAddonTextClass = "text-[#F4F4EF]";

/** Ghost submit / icon button on dark inside InputGroup. */
export const inputGhostButtonClass = "text-[#F4F4EF] hover:bg-[#F4F4EF]/10 hover:text-[#F4F4EF]";

// --- Blog empty state / CTAs ---

export const emptyStatePanelClass =
  "max-w-xl border border-[#F4F4EF]/20 bg-[#F4F4EF]/[0.04] text-[#F4F4EF]";

export const emptyStateIconWrapClass = "bg-[#F4F4EF]/12 text-[#F4F4EF]";

export const emptyStateTitleClass = "text-[#F4F4EF]";

export const emptyStateDescriptionClass = "text-[#F4F4EF]/75";

export const ctaSolidOnDarkClass = "bg-[#F4F4EF] text-[#3F3F3F] hover:bg-[#F4F4EF]/90";

export const ctaOutlineOnDarkClass =
  "border-[#F4F4EF]/45 bg-transparent text-[#F4F4EF] hover:bg-[#F4F4EF]/10";

export const ctaLinkMutedClass = "text-[#F4F4EF]/65";

// --- MDX / legal prose (MdxAgreement) ---

export const mdxHeadingBaseClass = "scroll-mt-20 font-normal tracking-[-0.01em] text-[#F4F4EF]";

export const mdxArticleClass = "max-w-none text-left text-sm md:text-[15px]";

export const mdxBodyMutedClass = "mb-4 text-[#F4F4EF]/90 last:mb-0";

export const mdxStrongClass = "font-medium text-[#F4F4EF]";

export const mdxUlClass =
  "mb-4 ml-6 list-disc space-y-2 text-[#F4F4EF]/90 marker:text-[#F4F4EF]/60";

export const mdxOlClass =
  "mb-4 ml-6 list-decimal space-y-2 text-[#F4F4EF]/90 marker:text-[#F4F4EF]/60";

export const mdxLiClass = "leading-relaxed";

export const mdxLinkClass =
  "text-[#F4F4EF] underline decoration-[#F4F4EF]/40 underline-offset-4 transition-opacity hover:opacity-80";

export const mdxHrClass = "my-8 border-[#F4F4EF]/20";

export const mdxBlockquoteClass =
  "my-4 border-l-2 border-[#F4F4EF]/30 pl-4 text-[#F4F4EF]/80 italic";

// --- Landing page (light sky hero) ---

/** Body, footer, form — Helvetica Neue. Headline uses `font-landing-serif` (Stratford). */
export const landingSansClass =
  "font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal tracking-[-0.01em]";

export const landingShellClass = `relative min-h-dvh bg-transparent text-black antialiased ${landingSansClass}`;

/** Grain overlay tuned for the light sky landing background. */
export const landingNoiseProps = {
  noiseOpacity: 0.3,
  mixBlendMode: "soft-light" as const,
  grainContrast: 1.45,
};

export const landingHeaderClass = "flex shrink-0 px-4 pt-4 md:px-6 md:pt-5";

export const landingMainClass =
  "flex flex-1 flex-col items-center justify-center px-3 py-6 text-center md:px-5 md:py-10";

/** Hero block entrance: slide up + fade in on first paint. */
export const landingHeroEnterClass =
  "animate-landing-hero-in motion-reduce:animate-none motion-reduce:opacity-100";

export const landingFooterClass = `flex shrink-0 flex-wrap items-end justify-between gap-2 px-4 pb-4 pt-2 text-xs text-black/80 md:px-6 md:pb-5 md:text-[13px] ${landingSansClass}`;

export const landingFooterLinkClass =
  "text-inherit no-underline transition-opacity hover:opacity-70";

export const landingHeroTitleClass =
  "font-landing-serif text-balance text-[2rem] font-normal leading-[0.896] md:text-[2.75rem] lg:text-[3.25rem] lg:leading-[0.88]";

export const landingConfirmTitleClass =
  "font-landing-serif text-balance text-[2rem] font-normal leading-[0.896] md:text-[2.75rem] lg:leading-[0.88]";

export const landingConfirmMessageClass = `mt-4 text-pretty text-sm leading-[1.32] text-[#838383] md:text-[15px] md:leading-[1.36] ${landingSansClass}`;

export const landingBodyClass = `text-pretty text-sm leading-[1.32] text-[#838383] md:text-[15px] md:leading-[1.36] ${landingSansClass}`;

export const landingCtaLabelClass = `text-sm text-[#838383] md:text-[15px] ${landingSansClass}`;

/** Inset pill email field on the sky hero (pairs with shadcn InputGroup + inline-end addon). */
export const landingInputGroupShellClass =
  "h-12 gap-0 rounded-full border-0 bg-[#8797B7]/30 p-2 text-white shadow-[inset_2px_3px_8px_rgba(0,0,0,0.12),inset_-1px_-1px_4px_#ffffff] ring-0 backdrop-blur-[2px] has-[[data-slot=input-group-control]:focus-visible]:shadow-[inset_2px_4px_10px_rgba(0,0,0,0.14),inset_-1px_-1px_4px_#ffffff] has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[>[data-align=inline-end]]:[&>input]:pr-0";

export const landingInputGroupInnerClass = `h-full min-h-0 border-0 bg-transparent pl-3 text-sm text-white caret-white shadow-none transition-[color,box-shadow] placeholder:text-[#ffffff] focus:placeholder:!text-[#E0E7EE] focus-visible:placeholder:!text-[#E0E7EE] focus-visible:ring-0 md:text-[15px] ${landingSansClass}`;

/** Reset shadcn inline-end addon padding/negative margin so the button sits in the pill cap. */
export const landingInputGroupAddonClass = "order-last h-full shrink-0 p-0 has-[>button]:!m-0";

export const landingSubmitButtonClass =
  "size-9 shrink-0 rounded-full border-0 bg-[#fafaf8] text-neutral-600 shadow-[0_2px_8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08)] transition-[background-color,color,box-shadow] duration-300 ease-in-out hover:bg-[#2E2E2E] hover:text-[#ffffff] hover:shadow-[0_3px_10px_rgba(0,0,0,0.14)]";
