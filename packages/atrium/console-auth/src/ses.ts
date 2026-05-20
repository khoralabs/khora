import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

function sesFromAddress(): string {
  const addr = process.env.SES_FROM_ADDRESS?.trim();
  if (addr === undefined || addr.length === 0) {
    throw new Error("SES_FROM_ADDRESS is not configured");
  }
  return addr;
}

function otpLogOnly(): boolean {
  const v = process.env.ATRIUM_AUTH_OTP_LOG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function sendOtpEmail(params: { email: string; otp: string }): Promise<void> {
  if (otpLogOnly()) {
    console.log(
      `[atrium-console-auth] OTP for ${params.email}: ${params.otp} (ATRIUM_AUTH_OTP_LOG — not sent via SES)`,
    );
    return;
  }

  const region = process.env.AWS_REGION?.trim() ?? "us-east-1";
  const ses = new SESClient({ region });
  await ses.send(
    new SendEmailCommand({
      Source: sesFromAddress(),
      Destination: { ToAddresses: [params.email] },
      Message: {
        Subject: { Data: "Your Atrium admin sign-in code" },
        Body: {
          Text: {
            Data: [
              "Your one-time sign-in code for Atrium Admin:",
              "",
              params.otp,
              "",
              "This code expires in a few minutes. If you did not request it, ignore this email.",
            ].join("\n"),
          },
        },
      },
    }),
  );
}
