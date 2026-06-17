erDiagram
    users ||--o{ orgs : "owns"
    users ||--o{ teams : "owns"
    users ||--o{ team_members : "member of"
    teams ||--o{ team_members : "has"
    orgs ||--o{ teams : "contains"

    teams ||--o{ sessions : "hosts"
    users ||--o{ sessions : "facilitates"

    sessions ||--o{ session_participants : "includes"
    users ||--o{ session_participants : "participates in"

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

    team_members }o--o| sessions : "onboarding_session_id"

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
        text owner_id FK
        text avatar_s3_key
        int created_at_ms
    }

    teams {
        text id PK
        text org_id FK
        text name
        text owner_id FK
        text avatar_s3_key
        int created_at_ms
    }

    team_members {
        text team_id PK_FK
        text user_id PK_FK
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

    session_participants {
        text session_id PK_FK
        text user_id PK_FK
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
