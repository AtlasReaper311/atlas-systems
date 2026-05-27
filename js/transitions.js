(function () {
  // Inject the overlay element used for fade transitions
  const overlay = document.createElement('div');
  overlay.id = 'page-overlay';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:#0a0a0f',
    'z-index:9999',
    'pointer-events:none',
    'opacity:1',
    'transition:opacity 0.35s ease',
  ].join(';');
  document.body.appendChild(overlay);

  // Fade in on load — short delay lets the page render first
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.style.transform = 'scale(0.98)';
      document.body.style.transition = 'transform 0.35s ease';
      overlay.style.opacity = '0';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.style.transform = 'scale(1)';
        });
      });
    });
  });

  // Intercept internal link clicks
  document.addEventListener('click', function (e) {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Skip external links, hash links, and new-tab links
    if (
      anchor.target === '_blank' ||
      href.startsWith('http') ||
      href.startsWith('#') ||
      href.startsWith('mailto')
    ) return;

    e.preventDefault();

    // Fade out and scale down
    overlay.style.transition = 'opacity 0.25s ease';
    overlay.style.opacity = '1';
    document.body.style.transform = 'scale(0.98)';

    setTimeout(() => {
      window.location.href = href;
    }, 260);
  });
})();
