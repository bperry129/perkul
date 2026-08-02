/*!
 * Perkul embeddable widget loader.
 * https://perkul.com/for-publishers
 *
 * Usage:
 *   <div class="perkul-widget" data-perkul-key="YOUR_KEY"></div>
 *   <script src="https://perkul.com/embed.js" async></script>
 *
 * `data-theme="dark"` is accepted but currently unused server-side — the
 * widget is white-on-white by design so it drops into an article without a
 * seam; the attribute is wired through now so a future dark variant does not
 * need a second script version.
 *
 * If your CMS strips <script> tags from article bodies (common on
 * WordPress, Arc and Brightspot), use a bare iframe instead — no JS engine
 * to strip, so it always survives:
 *
 *   <iframe src="https://perkul.com/embed/daily?k=YOUR_KEY"
 *           width="100%" height="640" style="border:0" loading="lazy"
 *           title="Perkul word game"></iframe>
 *
 * The fallback iframe has a fixed height because there is no script running
 * in the parent page to resize it — pick a height tall enough for a round in
 * progress on a phone (640px is comfortable) and let the widget scroll
 * internally rather than crop.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var ORIGIN = (function () {
    // Resolve relative to embed.js's own <script src>, not a hardcoded
    // string — this lets the exact same file serve a staging/preview
    // deployment without a rebuild.
    var current = document.currentScript;
    if (current && current.src) {
      try {
        return new URL(current.src).origin;
      } catch (e) {
        /* fall through */
      }
    }
    return 'https://perkul.com';
  })();

  var EMBED_URL = ORIGIN + '/embed/daily';
  var instances = [];

  function buildIframe(host) {
    var key = host.getAttribute('data-perkul-key');
    if (!key) {
      // A host div with no key is a snippet-paste mistake, not a runtime
      // condition worth failing silently on — surface it where a publisher's
      // developer will actually see it.
      console.error('[perkul] missing data-perkul-key on', host);
      return null;
    }

    var theme = host.getAttribute('data-theme');
    var src = EMBED_URL + '?k=' + encodeURIComponent(key) + (theme ? '&theme=' + encodeURIComponent(theme) : '');

    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = 'Perkul word game';
    iframe.loading = 'lazy';
    iframe.setAttribute('scrolling', 'no');
    iframe.style.width = '100%';
    iframe.style.border = '0';
    iframe.style.display = 'block';
    // A starting guess, replaced the instant the frame reports its real
    // height. Never zero — a zero-height iframe below the fold never
    // scrolls into the IntersectionObserver's view in the first place on
    // some lazy-load configurations.
    iframe.style.height = '420px';

    host.appendChild(iframe);
    return iframe;
  }

  function attachResizer(iframe) {
    function onMessage(event) {
      var data = event.data;
      if (!data || data.source !== 'perkul-embed' || data.type !== 'height') return;
      if (event.source !== iframe.contentWindow) return;
      var height = Number(data.height);
      if (height > 0) iframe.style.height = height + 'px';
    }
    window.addEventListener('message', onMessage);
  }

  function mount(host) {
    if (host.dataset.perkulMounted === '1') return;
    host.dataset.perkulMounted = '1';
    var iframe = buildIframe(host);
    if (!iframe) return;
    attachResizer(iframe);
    instances.push(iframe);
  }

  function lazyMount(host) {
    if (!('IntersectionObserver' in window)) {
      mount(host);
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            mount(host);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px' },
    );
    observer.observe(host);
  }

  function scan() {
    var hosts = document.querySelectorAll('.perkul-widget[data-perkul-key]');
    for (var i = 0; i < hosts.length; i += 1) lazyMount(hosts[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
