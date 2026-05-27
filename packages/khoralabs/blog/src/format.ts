export type FormatPostDateOptions = Intl.DateTimeFormatOptions;

const defaultCardOptions: FormatPostDateOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const defaultFullOptions: FormatPostDateOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

export function formatPostDate(
  date: string,
  options: FormatPostDateOptions = defaultCardOptions,
): string {
  if (!date || Number.isNaN(Date.parse(date))) return "";
  return new Date(date).toLocaleDateString(undefined, options);
}

export function formatPostDateFull(date: string): string {
  return formatPostDate(date, defaultFullOptions);
}

export function buildByline(post: { date: string; author?: string }): string {
  const dateLine = formatPostDateFull(post.date);
  return [dateLine, post.author].filter(Boolean).join(" · ");
}
