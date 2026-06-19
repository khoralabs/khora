import { Info } from "lucide-react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type OrgAgentIdentityFieldProps = {
  orgId: string | null;
};

/** Read-only org agent DID for organization settings. */
export function OrgAgentIdentityField({ orgId }: OrgAgentIdentityFieldProps) {
  return (
    <Field>
      <FieldLabel className="items-center gap-1.5">
        Agent DID
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="What is the organization agent DID?"
              >
                <Info className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              This organization&apos;s stable agent identity. Interview messages are attributed to
              this DID acting on behalf of your organization.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </FieldLabel>
      <p className="font-mono text-sm text-muted-foreground break-all">{orgId ?? "—"}</p>
    </Field>
  );
}
