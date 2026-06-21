/** Copy text within a user gesture. Falls back when Clipboard API is unavailable. */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Clipboard is not available");
  }

  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through — e.g. permission denied after async work in same handler.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("Copy command failed");
  } finally {
    document.body.removeChild(textarea);
  }
}
