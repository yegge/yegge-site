// /assets/js/inject.js
// Purpose: inject shared header/footer with root-relative links so they work on any domain.

const headerHTML = `
  <header class="container">
    <div class="flex between">
      <a href="/" class="logo"><img src="/assets/img/logo.svg" alt="Yegge" height="40"></a>
      <nav>
        <a href="/">INDEX</a>
        <a href="/about/">ABOUT</a>
        <a href="/music/catalog/">MUSIC</a>
        <a href="/contact/subscribe.html">SUBSCRIBE</a>
        <a href="/admin/">ADMIN</a>
      </nav>
    </div>
  </header>
`;

const footerHTML = `
  <footer class="center muted">
    © 2025 Brian Yegge
    · <a href="https://hyperfollow.com/brianyegge" target="_blank" rel="noopener">Brian</a>
    · <a href="https://hyperfollow.com/angershade" target="_blank" rel="noopener">Angershade</a>
    · <a href="https://hyperfollow.com/thecorruptive" target="_blank" rel="noopener">The Corruptive</a>
    · <a href="/terms.html">Terms</a>
    · <a href="/privacy.html">Privacy</a>
    · <a href="/contact/inquiry.html">Submit INQUIRY</a>
  </footer>
`;

document.getElementById('site-header')?.insertAdjacentHTML('afterbegin', headerHTML);
document.getElementById('site-footer')?.insertAdjacentHTML('afterbegin', footerHTML);