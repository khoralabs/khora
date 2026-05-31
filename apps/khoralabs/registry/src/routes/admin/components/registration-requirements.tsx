import type { RegistrationRequirementState } from "../admin-types.ts";

function requirementLabel(id: RegistrationRequirementState["id"]): string {
  if (id === "health_check") return "Health check";
  if (id === "operator_approval") return "Operator approval";
  return "Payment";
}

export function RegistrationRequirementsList({
  requirements,
}: {
  requirements: RegistrationRequirementState[];
}) {
  if (requirements.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-2" data-slot="registration-requirements">
      {requirements.map((item) => (
        <li
          key={item.id}
          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <div>
            <p className="font-medium">{requirementLabel(item.id)}</p>
            {item.detail !== undefined ? (
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
          <span className="font-mono text-xs uppercase">{item.status}</span>
        </li>
      ))}
    </ul>
  );
}
