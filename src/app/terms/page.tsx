import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Perkul.',
};

const EFFECTIVE_DATE = 'July 28, 2026';

export default function TermsPage() {
  return (
    <div className="shell shell--narrow prose">
      <div className="dateline">
        <span>Legal</span>
        <span>{BRAND.name}</span>
      </div>
      <h1 className="lede" style={{ fontSize: 'clamp(1.7rem, 6vw, 2.3rem)' }}>
        Terms of Service
      </h1>
      <p className="standfirst">
        Effective {EFFECTIVE_DATE}. Please read these terms carefully before using {BRAND.name}.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using {BRAND.name} (the &ldquo;Service&rdquo;), you agree to be bound by
        these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the Service.
        These Terms apply to all visitors, registered users, and any other person who accesses the
        Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        {BRAND.name} is a daily word game in which players identify a fabricated word among real
        ones. One new puzzle is published each day. The Service is provided by the operators of
        perkul.com (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
      </p>

      <h2>3. Eligibility</h2>
      <p>
        The Service is intended for users who are at least 13 years of age. By using the Service,
        you represent that you meet this requirement. If you are under 18, you represent that your
        parent or guardian has reviewed and agreed to these Terms on your behalf.
      </p>

      <h2>4. Account Registration</h2>
      <p>
        An account is not required to play. If you choose to create an account, you agree to provide
        accurate information and to keep it up to date. You are responsible for maintaining the
        confidentiality of your account credentials and for all activity under your account. Notify
        us immediately at{' '}
        <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> if you suspect unauthorized access.
      </p>
      <p>
        We reserve the right to suspend or terminate accounts that violate these Terms, contain
        abusive or impersonating display names, or have been inactive for an extended period.
      </p>

      <h2>5. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Automate gameplay or use bots, scripts, or other automated means to interact with the Service.</li>
        <li>Attempt to extract, scrape, or replicate answer keys, puzzle content, or proprietary data.</li>
        <li>Submit scores, results, or times you did not legitimately earn.</li>
        <li>Interfere with or disrupt the Service or its servers, networks, or security.</li>
        <li>Use the Service to transmit spam, malicious code, or any unlawful content.</li>
        <li>Impersonate another person or entity, or misrepresent your affiliation with any person or entity.</li>
        <li>Use the Service for any commercial purpose without our prior written consent.</li>
        <li>Circumvent, disable, or otherwise interfere with security features of the Service.</li>
      </ul>
      <p>
        Attempts that appear automated, statistically impossible, or otherwise in violation of fair
        play policies will be flagged, disqualified from public rankings, and may result in account
        termination.
      </p>

      <h2>6. Intellectual Property</h2>
      <p>
        All puzzle content, definitions, explanations, editorial copy, software, graphics, and other
        materials comprising the Service (&ldquo;Content&rdquo;) are owned by or licensed to us and
        are protected by copyright, trademark, and other intellectual property laws.
      </p>
      <p>
        You are granted a limited, non-exclusive, non-transferable, revocable license to access and
        use the Service for personal, non-commercial purposes only.
      </p>
      <p>
        Sharing your daily result (score, ranking, or a screenshot of your personal outcome) is
        encouraged. Republishing puzzle questions, word lists, definitions, or fabricated word
        explanations — in whole or in part — without our express written permission is prohibited.
      </p>

      <h2>7. User-Generated Content</h2>
      <p>
        If you submit a display name or other content through the Service, you grant us a
        worldwide, royalty-free license to display it as part of the Service. You represent that
        your display name does not infringe any third-party rights and does not contain offensive,
        hateful, or illegal material. We may remove or modify any user-generated content at our
        discretion.
      </p>

      <h2>8. Disclaimer of Warranties</h2>
      <p>
        THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT
        THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL
        COMPONENTS. PUZZLE CONTENT IS CURATED BY HUMANS AND MAY CONTAIN ERRORS; DISPUTES ARE
        HANDLED THROUGH OUR WORD POLICY.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL WE BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS,
        DATA, OR GOODWILL) ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE,
        EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU
        FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED FIFTY U.S. DOLLARS ($50).
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You agree to indemnify, defend, and hold harmless us and our officers, directors, employees,
        and agents from and against any claims, liabilities, damages, losses, and expenses (including
        reasonable attorneys&apos; fees) arising out of or in any way connected with your access to
        or use of the Service, your violation of these Terms, or your infringement of any third-party
        rights.
      </p>

      <h2>11. Third-Party Services</h2>
      <p>
        The Service may use third-party services (such as authentication and database providers) to
        operate. These third parties have their own privacy and security policies. We are not
        responsible for the practices of third-party services.
      </p>

      <h2>12. Termination</h2>
      <p>
        We may suspend or terminate your access to the Service at any time, with or without cause,
        with or without notice. Upon termination, your right to use the Service immediately ceases.
        Sections 6, 8, 9, and 10 survive termination.
      </p>

      <h2>13. Governing Law and Dispute Resolution</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the State of
        Delaware, United States, without regard to its conflict-of-law provisions. Any dispute
        arising from these Terms or your use of the Service shall first be addressed by contacting
        us at <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>. If we cannot resolve the
        dispute informally, it shall be resolved by binding arbitration under the rules of the
        American Arbitration Association, except that either party may seek injunctive or other
        equitable relief in a court of competent jurisdiction.
      </p>

      <h2>14. Changes to These Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. When we make material changes, we
        will update the effective date above and, where appropriate, notify registered users. Your
        continued use of the Service after any changes constitutes your acceptance of the revised
        Terms.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms? Email us at{' '}
        <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.
      </p>
    </div>
  );
}
