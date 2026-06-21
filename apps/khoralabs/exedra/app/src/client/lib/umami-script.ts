export function initUmamiScript(): void {
  const scriptUrl = process.env.BUN_PUBLIC_UMAMI_SCRIPT_URL?.trim();
  const websiteId = process.env.BUN_PUBLIC_UMAMI_WEBSITE_ID?.trim();
  if (scriptUrl === undefined || scriptUrl.length === 0) return;
  if (websiteId === undefined || websiteId.length === 0) return;

  if (document.querySelector(`script[data-website-id="${websiteId}"]`) !== null) return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = scriptUrl;
  script.dataset.websiteId = websiteId;
  document.head.appendChild(script);
}
