import { Loader } from "lucide-react";
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
} from "@/lib/ui-styles";

export function InviteEmailForm() {
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={`mt-3 ml-auto block w-full max-w-md ${fieldTypography}`}
      onSubmit={onSubmit}
      aria-busy={pending}
    >
      <InputGroup
        className={inputGroupShellClass}
        {...(pending ? { "data-disabled": true as const } : {})}
      >
        <InputGroupInput
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          placeholder="Request an invite token"
          aria-label="Request an invite token"
          className={inputGroupInnerTypography}
        />
        <InputGroupAddon align="inline-end" className={inputGroupAddonTextClass}>
          <InputGroupButton
            type="submit"
            disabled={pending}
            variant="ghost"
            size="sm"
            className={inputGhostButtonClass}
            aria-label={pending ? "Sending request" : "Submit invite request"}
          >
            {pending ? <Loader className="size-4 animate-spin" aria-hidden /> : "Submit"}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
