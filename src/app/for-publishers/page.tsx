import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND, siteUrl } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Free Games for News Websites — Embeddable Word Game Widget | Perkul',
  description:
    'Add a free, embeddable daily word game to your news site. Increase time on site and pageviews per session with a drop-in engagement widget — no cost, no ads unless you choose them.',
  alternates: { canonical: '/for-publishers' },
};

const faqItems = [
  {
    question: 'How much does the Perkul widget cost?',
    answer:
      "It's free. The only condition is a visible credit link back to perkul.com somewhere on the page the widget appears on — that's the whole deal. There is no fee, no revenue share required, and no minimum traffic commitment.",
  },
  {
    question: 'Does the widget slow down my page?',
    answer:
      'The loader (embed.js) is a few kilobytes and lazy-loads the game itself only when it scrolls into view, using IntersectionObserver. Nothing loads above the fold until a reader actually reaches the widget.',
  },
  {
    question: 'Will readers need an account to play?',
    answer:
      'No. Anyone can play instantly as a guest, unranked. If a reader wants their score on the public daily leaderboard, they can sign in through a popup — never inside your iframe — and their guest attempt is claimed onto their account.',
  },
  {
    question: 'What if my CMS strips <script> tags from article bodies?',
    answer:
      'Common on WordPress, Arc and Brightspot. Use the bare <iframe> fallback instead — no JavaScript required, so there is nothing for a content sanitiser to strip. See the snippet below.',
  },
  {
    question: 'Does the widget carry ads?',
    answer:
      'Not by default. Ads inside the widget are opt-in only, for publishers on a specific revenue-share agreement — we do not unilaterally monetize a slot inside your page.',
  },
  {
    question: 'How is the credit link enforced?',
    answer:
      "It isn't enforced by the widget itself — a script running inside an iframe has no way to verify anything about the page around it, and shouldn't be trusted to. We periodically check the real page for the link server-side. There's a grace period for transient issues (a CMS re-render, a temporary outage) before anything changes.",
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

const scriptSnippet = `<div class="perkul-widget" data-perkul-key="YOUR_KEY"></div>
<script src="${siteUrl('/embed.js')}" async></script>`;

const iframeSnippet = `<iframe src="${siteUrl('/embed/daily')}?k=YOUR_KEY"
        width="100%" height="640" style="border:0" loading="lazy"
        title="Perkul word game"></iframe>`;

export default function ForPublishersPage() {
  return (
    <div className="shell shell--narrow prose">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="dateline">
        <span>For publishers</span>
        <span>{BRAND.name}</span>
      </div>

      <h1 className="lede" style={{ fontSize: 'clamp(1.8rem, 6vw, 2.5rem)' }}>
        A free daily word game for your news site.
      </h1>

      <p className="standfirst">
        Drop a competitive, ten-round word puzzle into any article or section page. It's free
        engagement content: a reason to stay on the page a few extra minutes, click into another
        round, and come back tomorrow — with almost no engineering lift on your side.
      </p>

      <div className="toolbar" style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
        <a className="action" href="#snippet">
          Get the snippet
        </a>
        <Link className="action--ghost" href="/how-to-play">
          See how the game plays
        </Link>
      </div>

      <h2>Why an embeddable word game for publishers?</h2>
      <ul>
        <li>
          <strong>Increase time on site.</strong> Ten rounds takes five to ten minutes — measurably
          longer than a single Wordle-style guess.
        </li>
        <li>
          <strong>A genuine engagement widget for publishers</strong>, not a content-farm
          distraction: it's a real game with its own leaderboard, not an outbound link that sends
          readers away from your page.
        </li>
        <li>
          <strong>Free.</strong> No license fee, no revenue split required. The only condition is a
          visible credit link back to perkul.com — see "Attribution," below.
        </li>
        <li>
          <strong>Mobile-first.</strong> The widget resizes itself to fit its content via{' '}
          <code>postMessage</code>, so it never gets clipped on a phone-width article layout.
        </li>
      </ul>

      <h2 id="snippet">The snippet</h2>
      <p>Paste this once, anywhere in your page template or a single article body:</p>
      <pre className="code-block">
        <code>{scriptSnippet}</code>
      </pre>
      <p>
        Replace <code>YOUR_KEY</code> with the embed key we issue you. We'll also need the exact
        domain(s) the widget will run on. Request one below, or email us directly at{' '}
        <a href={`mailto:${BRAND.email}?subject=Perkul%20widget%20key`}>{BRAND.email}</a>.
      </p>

      <h3>If your CMS strips &lt;script&gt; tags</h3>
      <p>
        Common on WordPress, Arc and Brightspot article bodies. Use a bare iframe instead — there is
        no JavaScript for a sanitiser to remove, so it survives anywhere an <code>&lt;iframe&gt;</code>{' '}
        tag itself is allowed:
      </p>
      <pre className="code-block">
        <code>{iframeSnippet}</code>
      </pre>
      <p>
        The iframe fallback has a fixed height because there's no script in your page to resize it
        — 640px comfortably fits a round in progress on a phone, and the widget scrolls internally
        rather than cropping.
      </p>

      <h2>Attribution</h2>

      <p>
        The one condition: a visible link back to perkul.com somewhere in the HTML of the page
        hosting the widget (a byline, a "powered by" note, a footer credit — any wording, any
        placement). This matters for a specific technical reason: Google attributes an iframe's
        content to the iframe's own origin, not the parent page, so a link <em>inside</em> the widget
        is a self-link to us and passes no benefit to you or from you to us. The credit line in{' '}
        <em>your</em> page's own HTML is the only link that counts as a real backlink — which is
        also, not coincidentally, the entire reason we ask for it.
      </p>
      <p>
        We check the real, rendered page periodically for that link. If it's missing on every page
        we know about, there's a grace period before anything changes — a CMS re-render or a
        temporary outage on your end is not the same thing as removing the link on purpose.
      </p>

      <h2>Signed-in play</h2>
      <p>
        Anyone can play instantly as a guest — no account, unranked, zero friction. If a reader
        wants their result on the public daily leaderboard, they can sign in through a popup window
        that opens perkul.com directly (first-party, so their session cookie behaves normally). We
        never render a login form inside your iframe.
      </p>

      <h2 style={{ marginTop: '3rem' }}>Frequently asked questions</h2>
      <dl>
        {faqItems.map((item) => (
          <div key={item.question} style={{ marginBottom: '1.5rem' }}>
            <dt style={{ fontWeight: 700 }}>{item.question}</dt>
            <dd style={{ marginLeft: 0, marginTop: '0.4rem' }}>{item.answer}</dd>
          </div>
        ))}
      </dl>

      <div className="toolbar" style={{ marginTop: '2rem' }}>
        <a className="action" href={`mailto:${BRAND.email}?subject=Perkul%20widget%20key`}>
          Request an embed key
        </a>
        <Link className="action--quiet" href="/">
          Play {BRAND.name}
        </Link>
      </div>
    </div>
  );
}
