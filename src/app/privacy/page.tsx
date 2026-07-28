import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Perkul — how we collect, use, and protect your information.',
};

const EFFECTIVE_DATE = 'July 28, 2026';

export default function PrivacyPage() {
  return (
    <div className="shell shell--narrow prose">
      <div className="dateline">
        <span>Privacy</span>
        <span>{BRAND.name}</span>
      </div>
      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.3rem)' }}>
        Privacy Policy
      </h1>
      <p className="standfirst">
        Effective {EFFECTIVE_DATE}. We collect as little as possible and never sell your data.
      </p>

      <h2>1. Who We Are</h2>
      <p>
        {BRAND.name} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the
        website at perkul.com. We are the data controller for information collected through the
        Service. For any privacy-related questions, contact us at{' '}
        <a href="mailto:info@perkul.com">info@perkul.com</a>.
      </p>

      <h2>2. Information We Collect</h2>

      <h3>2a. Information you provide</h3>
      <ul>
        <li>
          <strong>Email address</strong> — collected only if you create an account. Used solely for
          authentication (sign-in link or magic link). Your email is never displayed publicly.
        </li>
        <li>
          <strong>Display name</strong> — a name you choose when creating an account. This name
          may appear on the public leaderboard if you have not opted out.
        </li>
      </ul>

      <h3>2b. Information collected automatically</h3>
      <ul>
        <li>
          <strong>Anonymous session identifier</strong> — a randomly generated ID stored in a
          first-party cookie. It is not linked to any personal information. It allows your daily
          result to persist across page refreshes and enforces the one-attempt-per-day rule.
        </li>
        <li>
          <strong>Game activity</strong> — when you start a game, complete a game, or view the
          leaderboard, we record an event in our own database. This includes timestamps, your
          score, your round choices, and the time taken per round. It does not include any
          information about your device, browser, or operating system beyond what is strictly
          necessary to operate the game.
        </li>
        <li>
          <strong>IP address</strong> — processed transiently by our hosting infrastructure for
          rate limiting and abuse prevention. We do not store IP addresses for analytics purposes.
        </li>
      </ul>

      <h3>2c. What we do NOT collect</h3>
      <ul>
        <li>We do not fingerprint your device or browser.</li>
        <li>We do not run any third-party advertising or tracking SDKs.</li>
        <li>We do not collect location data beyond general region (country/state) inferred from your IP for aggregate statistics only.</li>
        <li>We do not collect payment information (the Service is free).</li>
      </ul>

      <h2>3. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Operate and improve the Service (run the game, compute scores, maintain leaderboards).</li>
        <li>Authenticate you when you sign in with your email address.</li>
        <li>Enforce fair-play rules and detect cheating or abuse.</li>
        <li>Display your score and display name on the public leaderboard (only if you have not opted out).</li>
        <li>Analyze aggregate, anonymized usage patterns to improve puzzle design and user experience.</li>
        <li>Respond to your support requests or legal inquiries.</li>
        <li>Comply with applicable law.</li>
      </ul>
      <p>
        We do not use your data for advertising profiling, and we do not sell or rent your personal
        information to any third party.
      </p>

      <h2>4. Cookies and Similar Technologies</h2>
      <p>
        We use a single first-party cookie to store your anonymous session identifier. This cookie
        is strictly necessary for the Service to function and is therefore exempt from consent
        requirements under most cookie regulations.
      </p>
      <p>
        If you create an account and sign in, we use an additional first-party session cookie to
        maintain your authenticated state. This cookie expires when you sign out or after a period
        of inactivity.
      </p>
      <p>
        We do not use third-party cookies, advertising cookies, or persistent tracking technologies
        beyond those described above.
      </p>

      <h2>5. How We Share Your Information</h2>
      <p>
        We share your information only in the following limited circumstances:
      </p>
      <ul>
        <li>
          <strong>Service providers</strong> — we use third-party infrastructure providers
          (currently Supabase for database and authentication, and Vercel for hosting). These
          providers process data on our behalf under data processing agreements and are not
          permitted to use your data for their own purposes. They operate under appropriate
          security standards.
        </li>
        <li>
          <strong>Legal requirements</strong> — we may disclose information if required by law,
          court order, or governmental authority, or if we believe disclosure is necessary to
          protect our rights, your safety, or the safety of others.
        </li>
        <li>
          <strong>Business transfers</strong> — if we merge with or are acquired by another
          company, your information may be transferred as part of that transaction. We will notify
          you via email or a prominent notice on the Service before your data is transferred and
          becomes subject to a different privacy policy.
        </li>
      </ul>
      <p>We never sell your personal data.</p>

      <h2>6. Leaderboard and Public Information</h2>
      <p>
        If you have an account, your display name, rank, score, and accuracy for the current day
        may be shown on the public leaderboard by default. You can opt out of the public leaderboard
        at any time from your account settings. After opting out, your result no longer appears on
        the leaderboard, though it may still contribute anonymously to aggregate puzzle statistics
        (e.g., &ldquo;what percentage of players found this round difficult&rdquo;).
      </p>
      <p>
        Players without accounts participate anonymously and are shown as &ldquo;Guest&rdquo; on
        the leaderboard.
      </p>

      <h2>7. Data Retention</h2>
      <p>
        We retain your account information and game history for as long as your account is active.
        If you delete your account, we will delete or anonymize your personal data within 30 days,
        except where we are required to retain it for legal purposes.
      </p>
      <p>
        Anonymous session data (game attempts by guests) is retained for analytical purposes and
        may be kept indefinitely in anonymized form.
      </p>

      <h2>8. Your Rights and Choices</h2>
      <p>
        Depending on your location, you may have the following rights regarding your personal data:
      </p>
      <ul>
        <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
        <li><strong>Correction</strong> — request correction of inaccurate or incomplete data.</li>
        <li><strong>Deletion</strong> — request deletion of your personal data (&ldquo;right to be forgotten&rdquo;).</li>
        <li><strong>Portability</strong> — request your data in a structured, machine-readable format.</li>
        <li><strong>Objection / Opt-out</strong> — object to certain processing of your data, including opting out of the public leaderboard.</li>
        <li><strong>Restriction</strong> — request that we limit how we process your data in certain circumstances.</li>
      </ul>
      <p>
        To exercise any of these rights, email us at{' '}
        <a href="mailto:info@perkul.com">info@perkul.com</a> with your request. We will respond within 30 days.
        If you are located in the European Economic Area (EEA), you also have the right to lodge a
        complaint with your local data protection authority.
      </p>

      <h2>9. California Privacy Rights (CCPA / CPRA)</h2>
      <p>
        If you are a California resident, you have additional rights under the California Consumer
        Privacy Act (CCPA) and the California Privacy Rights Act (CPRA), including the right to
        know what personal information we collect, the right to delete your personal information,
        the right to opt out of the sale or sharing of personal information (we do not sell or
        share personal information), and the right not to be discriminated against for exercising
        these rights.
      </p>
      <p>
        To submit a verifiable consumer request, email{' '}
        <a href="mailto:info@perkul.com">info@perkul.com</a>.
      </p>

      <h2>10. Children&apos;s Privacy</h2>
      <p>
        The Service is not directed to children under the age of 13. We do not knowingly collect
        personal information from children under 13. If we learn that we have inadvertently
        collected such information, we will delete it promptly. If you believe a child under 13 has
        provided us with personal information, contact us at{' '}
        <a href="mailto:info@perkul.com">info@perkul.com</a>.
      </p>

      <h2>11. Data Security</h2>
      <p>
        We implement industry-standard security measures including encryption in transit (TLS),
        encrypted storage of credentials, and access controls limiting who can access personal data.
        However, no method of transmission over the Internet is 100% secure. We cannot guarantee
        absolute security and encourage you to use a strong, unique password for your account.
      </p>

      <h2>12. International Data Transfers</h2>
      <p>
        The Service is operated from the United States. If you access the Service from outside the
        United States, your information may be transferred to, stored, and processed in the United
        States or other countries where our service providers operate. By using the Service, you
        consent to these transfers. Where required by law (e.g., for EEA residents), we ensure
        appropriate safeguards are in place, such as Standard Contractual Clauses.
      </p>

      <h2>13. Third-Party Links</h2>
      <p>
        The Service may contain links to third-party websites. We are not responsible for the
        privacy practices of those sites. We encourage you to review the privacy policy of every
        site you visit.
      </p>

      <h2>14. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we make material changes, we will
        update the effective date at the top of this page and, where appropriate, notify registered
        users by email. Your continued use of the Service after any changes constitutes your
        acceptance of the updated Policy.
      </p>

      <h2>15. Contact Us</h2>
      <p>
        If you have any questions, concerns, or requests regarding this Privacy Policy or your personal
        data, please contact us at:
      </p>
      <p>
        <strong>{BRAND.name}</strong><br />
        <a href="mailto:info@perkul.com">info@perkul.com</a>
      </p>
    </div>
  );
}
