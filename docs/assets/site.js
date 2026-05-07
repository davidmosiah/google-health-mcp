document.documentElement.classList.add('js');

const revealItems = document.querySelectorAll('.section-shell, .proof-strip');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -80px 0px' });
  revealItems.forEach((item) => {
    item.setAttribute('data-reveal', '');
    observer.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(button.dataset.copy || '');
      button.textContent = 'Copied';
      button.classList.add('is-copied');
    } catch {
      button.textContent = 'Select text';
    }
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('is-copied');
    }, 1400);
  });
}
