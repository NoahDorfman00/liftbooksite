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

    // Subtle parallax on the hero preview slideshow
    const parallaxEl = document.querySelector('.parallax');
    if (parallaxEl) {
        window.addEventListener('scroll', () => {
            const y = window.scrollY || window.pageYOffset;
            const offset = Math.min(20, y * 0.04);
            parallaxEl.style.transform = `translateY(${offset}px)`;
        }, { passive: true });
    }

    // Preview slideshow functionality
    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    const indicators = document.querySelectorAll('.indicator');
    let currentSlide = 0;

    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });
        indicators.forEach((indicator, i) => {
            indicator.classList.toggle('active', i === index);
        });
        currentSlide = index;
    }

    function nextSlide() {
        const nextIndex = (currentSlide + 1) % slides.length;
        showSlide(nextIndex);
    }

    function prevSlide() {
        const prevIndex = (currentSlide - 1 + slides.length) % slides.length;
        showSlide(prevIndex);
    }

    if (prevBtn && nextBtn && slides.length > 0) {
        prevBtn.addEventListener('click', prevSlide);
        nextBtn.addEventListener('click', nextSlide);
    }

    // Handle indicator clicks
    indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
            showSlide(index);
        });
    });

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


