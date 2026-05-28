import { ArrowRight, Loader } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { getRegistryUrl } from "@/lib/registry-url";
import {
  consumerInputGroupAddonClass,
  consumerInputGroupInnerClass,
  consumerInputGroupShellClass,
  consumerSubmitButtonClass,
  fieldTypography,
  inputGhostButtonClass,
  inputGroupAddonTextClass,
  inputGroupInnerTypography,
  inputGroupShellClass,
  landingCtaLabelClass,
  landingInputGroupAddonClass,
  landingInputGroupInnerClass,
  landingInputGroupShellClass,
  landingSubmitButtonClass,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

type InviteEmailFormProps = {
  variant?: "dark" | "landing" | "consumer";
  onSuccess?: () => void;
};

export function InviteEmailForm({ variant = "dark", onSuccess }: InviteEmailFormProps) {
  const [pending, setPending] = useState(false);
  const isLanding = variant === "landing";
  const isConsumer = variant === "consumer";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = new FormData(form).get("email");
    if (typeof email !== "string" || email.trim().length === 0) return;

    setPending(true);
    try {
      await fetch(`${getRegistryUrl()}/v1/access-token/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          sourceApp: "khoralabs-homepage",
        }),
      });
      onSuccess?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={cn(
        "block w-full",
        isLanding
          ? "mx-auto mt-8 w-full max-w-[21rem]"
          : isConsumer
            ? "mt-8 w-full max-w-[28.8rem]"
            : `mt-3 ml-auto max-w-md ${fieldTypography}`,
      )}
      onSubmit={onSubmit}
      aria-busy={pending}
    >
      {isLanding ? (
        <p className={cn("mb-2 text-center", landingCtaLabelClass)}>
          Request an invite token for Khora + Vellum.
        </p>
      ) : null}
      <InputGroup
        className={cn(
          isLanding
            ? landingInputGroupShellClass
            : isConsumer
              ? consumerInputGroupShellClass
              : inputGroupShellClass,
        )}
        {...(pending ? { "data-disabled": true as const } : {})}
      >
        <InputGroupInput
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          placeholder={
            isLanding ? "Email" : isConsumer ? "Enter your email" : "Request an invite token"
          }
          aria-label={
            isLanding ? "Email" : isConsumer ? "Enter your email" : "Request an invite token"
          }
          className={cn(
            isLanding
              ? landingInputGroupInnerClass
              : isConsumer
                ? consumerInputGroupInnerClass
                : inputGroupInnerTypography,
          )}
        />
        <InputGroupAddon
          align="inline-end"
          className={cn(
            isLanding
              ? landingInputGroupAddonClass
              : isConsumer
                ? consumerInputGroupAddonClass
                : inputGroupAddonTextClass,
          )}
        >
          <InputGroupButton
            type="submit"
            disabled={pending}
            variant={isConsumer ? "default" : "ghost"}
            size={isLanding ? "icon-sm" : isConsumer ? "sm" : "sm"}
            className={cn(
              isLanding
                ? landingSubmitButtonClass
                : isConsumer
                  ? consumerSubmitButtonClass
                  : inputGhostButtonClass,
            )}
            aria-label={pending ? "Sending request" : "Submit invite request"}
          >
            {pending ? (
              <Loader className="size-4 animate-spin" aria-hidden />
            ) : isLanding ? (
              <ArrowRight className="size-4 stroke-[1.25] text-current" aria-hidden />
            ) : isConsumer ? (
              <>
                Request invite token
                <ArrowRight className="size-4 stroke-[1.25]" aria-hidden />
              </>
            ) : (
              "Submit"
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
