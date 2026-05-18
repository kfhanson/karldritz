import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import Hero from '../components/Hero';
import ProjectGrid from '../components/ProjectGrid';

const Home: React.FC = () => {
  useEffect(() => {
    document.title = 'Karldritz Farrel Hanson — Applied AI';
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <main id="main-content">
      <Hero />

      {/* Credentials strip */}
      <section className="border-y border-wire px-6 md:px-10 lg:px-16 py-6">
        <div className="max-w-[1280px] mx-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <p className="font-mono text-[11px] md:text-xs uppercase tracking-widest text-ink-muted">
            Huawei APAC Grand Finalist 2025
          </p>
          <p className="font-mono text-[11px] md:text-xs uppercase tracking-widest text-ink-muted">
            ICORIS 2024 — Published
          </p>
          <p className="font-mono text-[11px] md:text-xs uppercase tracking-widest text-ink-muted">
            Sertis Teknologi Indonesia
          </p>
          <p className="font-mono text-[11px] md:text-xs uppercase tracking-widest text-ink-muted">
            BINUS × Chang Gung
          </p>
        </div>
      </section>

      <ProjectGrid />

      {/* Open to section */}
      <section className="border-t border-wire px-6 md:px-10 lg:px-16 py-20">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-3">
            <p className="font-mono text-xs text-ink-muted uppercase tracking-widest">
              Open to
            </p>
          </div>
          <div className="md:col-span-9">
            <h2 className="font-display text-3xl md:text-5xl text-ink leading-[1.05] mb-6">
              Fall 2026 research & AI internships, and collaborations on applied RL, agentic systems, and LLM infrastructure.
            </h2>
            <a
              href="mailto:kfhanson.2508@gmail.com"
              className="inline-flex items-center gap-2 font-sans text-sm text-ink border-b border-ink pb-0.5 hover:text-pine hover:border-pine transition-colors duration-200"
            >
              Start a conversation <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      </main>

      <footer className="border-t border-wire px-6 md:px-10 lg:px-16 py-16">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-3">
              Get in touch
            </p>
            <a
              href="mailto:kfhanson.2508@gmail.com"
              className="font-display text-3xl md:text-4xl text-ink hover:text-pine transition-colors duration-200"
            >
              kfhanson.2508@gmail.com
            </a>
          </div>
          <p className="font-sans text-xs text-ink-muted flex-shrink-0">
            © 2025 Karldritz Farrel Hanson
          </p>
        </div>
      </footer>
    </motion.div>
  );
};

export default Home;
