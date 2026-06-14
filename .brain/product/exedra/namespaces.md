# Namespace Structure

Memories can belong to multiple hierarchical namespaces simultaneously (per `@khoralabs/memories` design).

## Design Principles

- **User namespace is top-level and portable** — a user's personal memory accumulates across all apps and teams; it is not owned by any org
- **Org namespace is similarly portable** — an org's shared knowledge can power multiple business apps beyond alignment
- Both are first-class namespaces, not subordinates of any product namespace

## Hierarchy

```
org
└── team
    └── session
```

A user belongs to an org, which contains teams, which run sessions. Org-level ground truth accumulates across teams.

## Namespace Paths

| Namespace | Contents |
|---|---|
| `_global_/{userId}` | User's global personal memory (portable, app-agnostic) |
| `_global_/{userId}/org/{orgId}/team/{teamId}` | User's beliefs scoped to a team |
| `_global_/{userId}/org/{orgId}/team/{teamId}/session/{sessionId}` | User's beliefs from a specific session |
| `_global_/org/{orgId}` | Org-wide shared ground truth |
| `_global_/org/{orgId}/team/{teamId}` | Team-wide shared ground truth — promoted `fact` memories |
| `_global_/org/{orgId}/team/{teamId}/session/{sessionId}` | Session namespace — contentions, alignment chat, session facts |

## Multi-namespace Membership

A single memory can be indexed into multiple namespaces simultaneously. For example:

- A `fact` committed during alignment lives in the session, team, and org namespaces simultaneously
- A stakeholder's superseded belief retains membership in their personal namespace with a `supersedes` edge linking to the updated belief

## Query Patterns

| Goal | Namespace to query |
|---|---|
| What does Alice believe about X across all sessions? | `_global_/{aliceId}/org/{orgId}/team/{teamId}` |
| What did Alice believe during a specific session? | `_global_/{aliceId}/org/{orgId}/team/{teamId}/session/{sessionId}` |
| What is the team's current ground truth? | `_global_/org/{orgId}/team/{teamId}` |
| What is the org's cross-team ground truth? | `_global_/org/{orgId}` |
| What was contested in a session? | `_global_/org/{orgId}/team/{teamId}/session/{sessionId}` |

## Deployment Models

| Model | Who hosts | Use case |
|---|---|---|
| **Custodial** | Khora Labs (hosted) | Individual users; personal memory managed by the platform |
| **Local agent** | User's own machine | Private personal memories; user owns data locally |
| **Self-hosted** | Company's own infra | Company memories; org controls their own knowledge base |

The namespace design is deployment-agnostic — the same paths work regardless of where the memories backend lives. This enables future apps (beyond alignment) to tap into user or org memory from any deployment.
