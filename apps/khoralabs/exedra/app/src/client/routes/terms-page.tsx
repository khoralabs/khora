import { LegalPageLayout } from "./legal-page-layout";

export function TermsPage() {
  return (
    <LegalPageLayout
      title="Exedra Terms of Service"
      effectiveDate="June 19, 2026"
      lastUpdated="June 19, 2026"
    >
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Exedra, an
        AI-assisted interview and alignment platform provided by Coffee Fueled Dev, LLC, doing
        business as Khora Labs (&ldquo;Khora,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;).
      </p>
      <p>
        By creating an account or using Exedra, you agree to these Terms. If you use Exedra on
        behalf of an organization, you represent that you have authority to bind that organization.
      </p>

      <h2>1. The Service</h2>
      <p>
        Exedra helps teams run structured interviews, capture beliefs and alignment signals, and
        review session outcomes within organizations and teams. The Service may use third-party
        language models to conduct interviews and analyze responses on your organization&apos;s
        behalf.
      </p>
      <p>
        Each user and organization in Exedra receives a cryptographic agent identity (DID) used for
        message attribution and optional participation in the Khora network. Joining the Khora
        network is optional and requires a separate explicit opt-in.
      </p>

      <h2>2. Accounts and Access</h2>
      <p>
        You sign in through the Khora registry using email verification. You are responsible for
        activity under your account and for safeguarding access to your email and session. Notify us
        at info@khoralabs.com if you suspect unauthorized use.
      </p>

      <h2>3. Customer Data</h2>
      <p>You retain ownership of data you submit through Exedra, including:</p>
      <ul>
        <li>Interview messages and transcripts</li>
        <li>Belief flags and session feedback</li>
        <li>Uploaded session documents</li>
        <li>Organization, team, and profile information</li>
      </ul>
      <p>
        We process Customer Data only to operate Exedra for you, as described in our Privacy Policy.
        We do not sell Customer Data or use it to train unrelated AI products.
      </p>

      <h2>4. AI Features</h2>
      <p>
        Exedra uses third-party AI providers (such as OpenAI and Google) to power interview agents
        and memory search. Interview content you submit may be sent to those providers to generate
        responses. Your organization controls which sessions and documents are processed.
      </p>

      <h2>5. Khora Network (Optional)</h2>
      <p>
        You may optionally register your user or organization agent identity on the Khora network.
        Network registration publishes a public profile associated with your DID on a Khora host.
        User network participation also links your agent identity to your registry account. Org
        agents are registered on the host only and are not linked to a personal registry account.
      </p>

      <h2>6. Acceptable Use</h2>
      <p>
        You agree not to use Exedra to violate law, infringe others&apos; rights, upload malicious
        content, or attempt to circumvent access controls or abuse rate limits.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using Exedra at any time. We may suspend access for material breach of these
        Terms. Upon termination, we will delete or anonymize Customer Data we hold within 30 days
        where no longer required by law.
      </p>

      <h2>8. Disclaimers and Liability</h2>
      <p>
        EXCEPT AS EXPRESSLY STATED, EXEDRA IS PROVIDED &ldquo;AS IS.&rdquo; TO THE MAXIMUM EXTENT
        PERMITTED BY LAW, OUR AGGREGATE LIABILITY ARISING FROM THESE TERMS OR THE SERVICE WILL NOT
        EXCEED ONE HUNDRED U.S. DOLLARS ($100).
      </p>

      <h2>9. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the State of Michigan, United States. Disputes will
        be brought in Michigan state or federal courts unless the parties agree otherwise in
        writing.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms:{" "}
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
