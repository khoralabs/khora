import { LegalPageLayout } from "./legal-page-layout";

export function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Exedra Privacy Policy"
      effectiveDate="June 19, 2026"
      lastUpdated="June 19, 2026"
    >
      <p>
        This Privacy Policy describes how Coffee Fueled Dev, LLC, doing business as Khora Labs
        (&ldquo;Khora,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects,
        uses, and protects information in connection with Exedra.
      </p>

      <h2>1. Information We Process</h2>
      <h3>Account and identity</h3>
      <ul>
        <li>Email address and registry account identifier (for sign-in)</li>
        <li>Profile fields you provide (name, job function, avatar)</li>
        <li>Custodial agent DID and encrypted signing material stored by Exedra</li>
        <li>Terms acceptance timestamp and optional Khora network opt-in timestamp</li>
      </ul>
      <h3>Interview and session data</h3>
      <ul>
        <li>Interview messages, tool outputs, and belief flags</li>
        <li>Session documents you upload and derived summaries</li>
        <li>Organization, team, and membership structure</li>
        <li>Memory graph data scoped to your organization and personal namespaces</li>
      </ul>
      <h3>Service data</h3>
      <ul>
        <li>IP address and request metadata for security and rate limiting</li>
        <li>Diagnostic and operational logs</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Authenticate you and operate Exedra</li>
        <li>Run AI-assisted interviews and memory search on your behalf</li>
        <li>Enforce organization and team access controls</li>
        <li>Optionally register agent identities on the Khora network when you opt in</li>
        <li>Respond to support requests and comply with legal obligations</li>
      </ul>
      <p>We do not sell personal information or use Customer Data to train unrelated AI models.</p>

      <h2>3. AI and Third-Party Processors</h2>
      <p>
        Interview agents and embedding search may send text to third-party AI providers (such as
        OpenAI and Google). Memory search may use Google embedding APIs when configured. Registry
        email OTP is delivered via AWS SES. Avatars and documents may be stored in S3-compatible
        object storage. Database backups may be replicated via Litestream.
      </p>

      <h2>4. Khora Network</h2>
      <p>
        If you opt in, your user or organization agent DID and public profile fields are registered
        on a Khora host. User opt-in also links your agent to your registry account. You are not
        anonymous to the operator of the host you publish on.
      </p>

      <h2>5. Retention and Deletion</h2>
      <p>
        We retain Customer Data as long as needed to provide the Service. You may request deletion
        by contacting info@khoralabs.com. Upon account termination, we delete or anonymize data we
        hold within 30 days where legally permitted.
      </p>

      <h2>6. Security</h2>
      <p>
        We use TLS in transit, encrypted storage for custodial agent keys, access controls, and
        encrypted backups. We will notify affected customers without undue delay of a confirmed
        breach that materially affects Customer Data.
      </p>

      <h2>7. Your Rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict
        processing of your personal information. Contact info@khoralabs.com to exercise these
        rights.
      </p>

      <h2>8. Children</h2>
      <p>Exedra is not directed to children under 13 (or under 16 in the EEA/UK).</p>

      <h2>9. Changes</h2>
      <p>
        We may update this Policy. Material changes will be communicated with at least 30 days&apos;
        notice where practicable.
      </p>

      <h2>10. Contact</h2>
      <p>
        <a href="mailto:info@khoralabs.com" className="underline">
          info@khoralabs.com
        </a>
      </p>
      <p className="text-muted-foreground">
        Coffee Fueled Dev, LLC (d/b/a Khora Labs)
        <br />
        8233 John R St, Detroit, MI 48202, United States
      </p>
    </LegalPageLayout>
  );
}
