/* PrevenSalud CRM+ showcase — interactions */
(function () {
  'use strict';

  // Nav: shadow on scroll
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => links.classList.remove('open'))
    );
  }

  // Scroll reveal
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Active nav link via section observation
  const navMap = {};
  document.querySelectorAll('.nav-links a[href^="#"]').forEach((a) => {
    navMap[a.getAttribute('href').slice(1)] = a;
  });
  const sec = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const a = navMap[e.target.id];
        if (a && e.isIntersecting) {
          Object.values(navMap).forEach((x) => x.classList.remove('active'));
          a.classList.add('active');
        }
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll('section[id]').forEach((s) => sec.observe(s));

  // Mermaid init (loaded via CDN in the page)
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
      themeVariables: {
        fontFamily: 'Inter, sans-serif',
        primaryColor: '#0a0f1d',
        primaryTextColor: '#e8edf7',
        primaryBorderColor: '#2dd4bf',
        lineColor: '#67728c',
        secondaryColor: '#0e1530',
        tertiaryColor: '#0e1530',
      },
    });
  }
})();
