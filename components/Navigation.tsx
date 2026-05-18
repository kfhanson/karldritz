import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

const Navigation: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight - 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // On the home page the hero has a dark shader background — use light text until scrolled
  const darkHero = location.pathname === '/' && !scrolled;

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 lg:px-16 py-5 transition-all duration-300 ${
          scrolled ? 'border-b border-wire bg-canvas/95 backdrop-blur-sm' : ''
        }`}
      >
        <Link
          to="/"
          className={`cactus-font text-2xl transition-colors duration-300 ${
            darkHero
              ? 'text-white hover:text-white/70'
              : 'text-ink hover:text-pine'
          }`}
        >
          Karldritz Hanson
        </Link>
        <div className="flex items-center gap-8">
          <Link
            to="/"
            aria-current={location.pathname === '/' ? 'page' : undefined}
            className={`text-sm font-sans transition-colors duration-300 ${
              darkHero
                ? location.pathname === '/' ? 'text-white' : 'text-white/60 hover:text-white'
                : location.pathname === '/' ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Work
          </Link>
          <Link
            to="/about"
            aria-current={location.pathname === '/about' ? 'page' : undefined}
            className={`text-sm font-sans transition-colors duration-300 ${
              darkHero
                ? location.pathname === '/about' ? 'text-white' : 'text-white/60 hover:text-white'
                : location.pathname === '/about' ? 'text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            About
          </Link>
        </div>
      </motion.nav>
    </>
  );
};

export default Navigation;
