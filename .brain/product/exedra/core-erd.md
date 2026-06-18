erDiagram
    users ||--o{ team_account_onboarding : "onboarding state"
    teams ||--o{ team_account_onboarding : "tracks"
    teams ||--o{ sessions : "hosts"
    users ||--o{ sessions : "facilitates"

    sessions ||--o{ session_invites : "minted for"
    users ||--o{ session_invites : "consumed by"

    teams ||--o{ team_invites : "minted for"
    users ||--o{ team_invites : "created by"

    sessions ||--o{ threads : "has"
    users ||--o{ threads : "owns (interview)"
    threads ||--o{ messages : "contains"
    threads ||--o{ belief_feedback : "has"

    sessions ||--o{ session_documents : "has"
    users ||--o{ session_documents : "uploaded by"

    authz_grants {
        text id PK
        text scope_type "org|team|account|session"
        text scope_id "polymorphic, no FK"
        text resource_type "org|team|session|thread"
        text resource_id "polymorphic, no FK"
        text feature "member|admin|participant|read|permissions_manage|write|team_manage|member_manage"
        int created_at_ms
        int expired_at_ms "nullable"
        int revoked_at_ms "nullable"
    }

    authz_entitlements {
        text id PK
        text scope_type "org|team|account|session"
        text scope_id "polymorphic, no FK"
        text feature "app-level, no resource row"
        int created_at_ms
        int expired_at_ms "nullable"
        int revoked_at_ms "nullable"
    }

    users {
        text id PK
        text registry_user_id UK
        text full_name
        text job_function
        text avatar_s3_key
        blob identity_encrypted
        int created_at_ms
    }

    orgs {
        text id PK
        text name
        text avatar_s3_key
        int created_at_ms
    }

    teams {
        text id PK
        text name
        text avatar_s3_key
        int created_at_ms
    }

    team_account_onboarding {
        text team_id PK_FK
        text account_id PK_FK
        int onboarding_interview_complete
        text onboarding_session_id FK
        int created_at_ms
    }

    sessions {
        text id PK
        text team_id FK
        text topic
        text facilitator_id FK
        text status
        text kind "standard | onboarding"
        int deadline_ms
        int created_at_ms
    }

    session_invites {
        text token_hash PK
        text session_id FK
        int created_at_ms
        int consumed_at_ms
        text consumed_by_user_id FK
    }

    team_invites {
        text token_hash PK
        text team_id FK
        text created_by_user_id FK
        int created_at_ms
        int revoked_at_ms
    }

    threads {
        text id PK
        text kind "interview | alignment"
        text session_id FK
        text user_id FK
        int created_at_ms
        int closed_at_ms
    }

    messages {
        text id PK
        text thread_id FK
        text role
        blob parts
        blob metadata
        int message_index
        int created_at_ms
    }

    belief_feedback {
        text thread_id PK_FK
        text belief_id PK
        text source_message_id
        text feedback
        text correction
        int updated_at_ms
    }

    session_documents {
        text id PK
        text session_id FK
        text uploaded_by_user_id FK
        text file_name
        text s3_key
        text memory_key
        text summary
        int created_at_ms
    }

    jobs {
        text id PK
        text kind
        text status
        blob payload
        int created_at_ms
    }

```

## Access control notes

- **Auth sessions** (registry OTP) are not stored in Exedra SQLite; the `session` scope type is reserved for future use.
- **Invariants:** at most one active grant per `(Scope, Resource, Feature)`; at most one active entitlement per `(Scope, Feature)` (enforced via partial unique indexes and upsert in `grant()` / `entitle()`).
- **Session participation:** `scope=account:U`, `resource=session:S`, `feature=participant`.
- **Team membership:** `scope=account:U`, `resource=team:T`, `feature=member`.
- **Team/org admin:** `scope=account:U`, `resource=team:T|org:O`, `feature=admin`.
- **Team → org containment:** `scope=team:T`, `resource=org:O`, `feature=member` (one org per team).
- **Org membership (derived):** account is org member iff member of any team that belongs to the org.
- **Thread read access:** thread owner (`threads.user_id`) or grant `scope=account:U`, `resource=thread:T`, `feature=read`.

### Grant mappings

| Relationship | Grant |
|---|---|
| Account → team membership | scope=account, resource=team, feature=member |
| Account → team admin | scope=account, resource=team, feature=admin |
| Account → org admin | scope=account, resource=org, feature=admin (legacy; implies all org permissions) |
| Account → org permissions | scope=account, resource=org, feature=permissions_manage \| write \| read \| team_manage \| member_manage |
| Account → team permissions | scope=account, resource=team, feature=write \| read \| member_manage |
| Team → org membership | scope=team, resource=org, feature=member |
| Account → session participation | scope=account, resource=session, feature=participant |
| Account → thread read | scope=account, resource=thread, feature=read |
