export type AppEvent =
  | "waitlist.otp_requested"
  | "waitlist.otp_verified"
  | "waitlist.signup_completed"
  | "contact.otp_requested"
  | "contact.otp_verified"
  | "contact.message_submitted";

export function logEvent(event: AppEvent): void {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}
