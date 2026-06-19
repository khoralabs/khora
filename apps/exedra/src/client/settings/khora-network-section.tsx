import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

type KhoraNetworkSectionProps = {
  title: string;
  description: string;
  networkOptedInAtMs: number | null;
  networkJoinAvailable: boolean;
  onJoin: () => Promise<{ networkOptedInAtMs: number }>;
  onJoined: (networkOptedInAtMs: number) => void;
};

function formatOptInDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ms),
  );
}

export function KhoraNetworkSection({
  title,
  description,
  networkOptedInAtMs,
  networkJoinAvailable,
  onJoin,
  onJoined,
}: KhoraNetworkSectionProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleJoin() {
    setSubmitting(true);
    try {
      const result = await onJoin();
      onJoined(result.networkOptedInAtMs);
      toast.success("Joined Khora network");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join Khora network");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FieldSet className="mt-8 border-t pt-8">
      <Field>
        <FieldLabel>{title}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
        {networkOptedInAtMs !== null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Joined {formatOptInDate(networkOptedInAtMs)}
          </p>
        ) : networkJoinAvailable ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={submitting}
            onClick={() => void handleJoin()}
          >
            {submitting ? <Spinner className="size-4" aria-hidden /> : "Join Khora network"}
          </Button>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Network registration is not configured for this deployment.
          </p>
        )}
      </Field>
    </FieldSet>
  );
}
