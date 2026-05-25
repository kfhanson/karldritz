import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ShaderField from './ShaderField';
import PhotoCard from './PhotoCard';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const Hero: React.FC = () => {
  return (
    <section
      aria-label="Introduction"
      className="relative min-h-screen flex flex-col justify-end pb-16 px-6 md:px-10 lg:px-16 pt-32 overflow-hidden bg-[#0a0a0a]"
    >
      <ShaderField />

      <div className="relative z-10 max-w-[1280px] mx-auto w-full">

        <motion.p
          custom={0}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="font-mono text-xs text-white/50 uppercase tracking-widest mb-8"
        >
          Applied AI — Jakarta, Indonesia
        </motion.p>

        {/* Headline + card side by side */}
        <div className="lg:grid lg:grid-cols-[1fr_auto] lg:items-start lg:gap-12 mb-10">
          <motion.h1
            custom={1}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="font-display text-[clamp(3.5rem,9vw,8.5rem)] leading-[0.92] tracking-tight text-white"
          >
            I build AI<br />
            that learns<br />
            from the world.
          </motion.h1>

          <div className="hidden lg:block" aria-hidden="true">
            <PhotoCard />
          </div>
        </div>

        <motion.div
          custom={2}
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-t border-white/15 pt-8"
        >
          <p className="font-sans text-sm text-white/60 max-w-sm leading-relaxed">
            I'm Karldritz Hanson — reinforcement learning, agentic systems, and applied AI for the real world.
            <br />
            AI Engineer Intern at Sertis Teknologi Indonesia.
          </p>
          <div className="flex items-center gap-6 flex-shrink-0">
            <Link
              to="/about"
              className="font-sans text-sm text-white/70 border-b border-white/30 pb-0.5 hover:text-white hover:border-white transition-colors duration-200"
            >
              About me
            </Link>
            <a
              href="mailto:kfhanson.2508@gmail.com"
              className="font-sans text-sm text-white/70 border-b border-white/30 pb-0.5 hover:text-white hover:border-white transition-colors duration-200"
            >
              Get in touch
            </a>
          </div>
        </motion.div>

      </div>
    </section>
  );
};

export default Hero;
