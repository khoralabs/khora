import { ArrowRight, Loader } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
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
  variant?: "dark" | "landing";
  onSuccess?: () => void;
};

export function InviteEmailForm({ variant = "dark", onSuccess }: InviteEmailFormProps) {
  const [pending, setPending] = useState(false);
  const isLanding = variant === "landing";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
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
          : `mt-3 ml-auto max-w-md ${fieldTypography}`,
      )}
      onSubmit={onSubmit}
      aria-busy={pending}
    >
      {isLanding ? (
        <p className={cn("mb-2 text-center", landingCtaLabelClass)}>
          Request an invite token for Atrium + Vellum.
        </p>
      ) : null}
      <InputGroup
        className={cn(isLanding ? landingInputGroupShellClass : inputGroupShellClass)}
        {...(pending ? { "data-disabled": true as const } : {})}
      >
        <InputGroupInput
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          placeholder={isLanding ? "Email" : "Request an invite token"}
          aria-label={isLanding ? "Email" : "Request an invite token"}
          className={cn(isLanding ? landingInputGroupInnerClass : inputGroupInnerTypography)}
        />
        <InputGroupAddon
          align="inline-end"
          className={cn(isLanding ? landingInputGroupAddonClass : inputGroupAddonTextClass)}
        >
          <InputGroupButton
            type="submit"
            disabled={pending}
            variant="ghost"
            size={isLanding ? "icon-sm" : "sm"}
            className={cn(isLanding ? landingSubmitButtonClass : inputGhostButtonClass)}
            aria-label={pending ? "Sending request" : "Submit invite request"}
          >
            {pending ? (
              <Loader className="size-4 animate-spin" aria-hidden />
            ) : isLanding ? (
              <ArrowRight className="size-4 stroke-[1.25] text-current" aria-hidden />
            ) : (
              "Submit"
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
