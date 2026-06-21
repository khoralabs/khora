import { Info } from "lucide-react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AccountIdentityFieldsProps = {
  email: string | null;
  did: string;
};

/** Read-only identity keys (email + DID). Non-editable, so rendered as labeled text, never inputs. */
export function AccountIdentityFields({ email, did }: AccountIdentityFieldsProps) {
  return (
    <>
      <Field>
        <FieldLabel>Email</FieldLabel>
        <p className="text-sm text-foreground break-all">{email ?? "—"}</p>
      </Field>
      <Field>
        <FieldLabel className="items-center gap-1.5">
          DID
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="What is a DID?"
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                A decentralized identifier (DID) is this account's unique, portable cryptographic
                identity. It is public and safe to share.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </FieldLabel>
        <p className="font-mono text-sm text-muted-foreground break-all">{did}</p>
      </Field>
    </>
  );
}
