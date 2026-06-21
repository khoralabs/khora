export type SessionCompletionPayload = {
  summary: string;
  nextSessionOptions: string[];
};

export function buildSessionClosingMessage(payload: SessionCompletionPayload): string {
  const summary = payload.summary.trim();
  const options = payload.nextSessionOptions.map((option) => option.trim()).filter(Boolean);

  const lines = [
    summary.length > 0 ? summary : "Thanks for sharing your perspective in this session.",
    "",
    "Take a moment to review the beliefs in the canvas on the right. Confirm what's accurate and refine anything that needs adjustment.",
  ];

  if (options.length > 0) {
    lines.push("", "If you'd like to go deeper, consider a follow-up session on:");
    for (const option of options) {
      lines.push(`- ${option}`);
    }
  }

  lines.push(
    "",
    "You can keep chatting here if you have follow-up questions or want to refine anything.",
  );

  return lines.join("\n");
}
