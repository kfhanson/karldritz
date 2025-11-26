import React from 'react';
import { motion } from 'framer-motion';
import Hero from '../components/Hero';
import HorizontalScroll from '../components/HorizontalScroll';

const Home: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <Hero />
      <div className="relative z-10 bg-[#0a0a0a]">
        <HorizontalScroll />
      </div>
      <footer className="h-[50vh] flex flex-col justify-center items-center bg-[#0a0a0a] border-t border-white/10">
        <p className="text-gray-500 uppercase tracking-widest text-sm mb-4">Get in touch</p>
        <a href="mailto:kfhanson.2508@gmail.com" className="text-4xl md:text-6xl font-[Syne] font-bold hover:text-gray-300 transition-colors">
          kfhanson.2508@gmail.com
        </a>
        <div className="mt-12 text-sm text-gray-600">
          © 2025 Karldritz Farrel Hanson.
        </div>
      </footer>
    </motion.div>
  );
};

export default Home;