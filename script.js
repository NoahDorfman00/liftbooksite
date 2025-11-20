(function () {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    // IntersectionObserver for reveal-on-scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    // Subtle parallax on the hero phone mock
    const parallaxEl = document.querySelector('.parallax');
    if (parallaxEl) {
        window.addEventListener('scroll', () => {
            const y = window.scrollY || window.pageYOffset;
            const offset = Math.min(20, y * 0.04);
            parallaxEl.style.transform = `translateY(${offset}px)`;
        }, { passive: true });
    }

    // Wire all CTAs to the same App Store link if provided later
    const appStoreUrl = null; // TODO: replace with actual App Store URL
    if (appStoreUrl) {
        const links = [
            document.getElementById('app-store-link'),
            document.getElementById('download-app-store'),
            document.getElementById('demo-app-store-link')
        ].filter(Boolean);
        links.forEach((a) => { a.href = appStoreUrl; a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); });
    }

    // Handle "Get the app" link on demo page to scroll to button
    const headerGetAppLink = document.querySelector('nav a[href="#demo-app-store"]');
    if (headerGetAppLink) {
        headerGetAppLink.addEventListener('click', (e) => {
            e.preventDefault();
            const demoButton = document.getElementById('demo-app-store-link');
            if (demoButton) {
                demoButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }
})();


