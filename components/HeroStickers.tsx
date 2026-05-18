import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const huaweiSummit = new URL('../images/photocards/huawei-summit.jpeg', import.meta.url).href;
const apacFinalist = new URL('../images/photocards/apac-finalist.jpeg', import.meta.url).href;
const alibabaHackathon = new URL('../images/photocards/alibaba-hackathon.jpeg', import.meta.url).href;

interface Photocard {
  id: string;
  image: string;
  caption: string;
  rotate: number;
  delay: number;
  top: string;
  right: string;
}

const PHOTOCARDS: Photocard[] = [
  {
    id: 'apac-finalist',
    image: apacFinalist,
    caption: '🏆 APAC Grand Finalist',
    rotate: -4,
    delay: 0.3,
    top: 'top-[15%]',
    right: 'right-[8%]',
  },
  {
    id: 'huawei-summit',
    image: huaweiSummit,
    caption: '☁️ Huawei Cloud Summit',
    rotate: 3,
    delay: 0.45,
    top: 'top-[38%]',
    right: 'right-[16%]',
  },
  {
    id: 'alibaba-hackathon',
    image: alibabaHackathon,
    caption: '🥈 2nd Winner — Alibaba Hackathon',
    rotate: -2,
    delay: 0.6,
    top: 'top-[58%]',
    right: 'right-[7%]',
  },
];

const HeroStickers: React.FC = () => {
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const constraints = {
    left: -viewport.w,
    right: viewport.w,
    top: -viewport.h,
    bottom: viewport.h,
  };

  return (
    <div className="hidden lg:block" aria-hidden="true">
      {PHOTOCARDS.map((card) => (
        <motion.div
          key={card.id}
          drag
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={constraints}
          initial={{ opacity: 0, scale: 0, rotate: card.rotate - 8 }}
          animate={{ opacity: 1, scale: 1, rotate: card.rotate }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: card.delay }}
          whileHover={{ scale: 1.03 }}
          whileDrag={{ scale: 1.05, zIndex: 50 }}
          className={`absolute ${card.top} ${card.right} cursor-grab active:cursor-grabbing select-none z-20`}
          style={{ width: '200px' }}
        >
          {/* Frosted glass Polaroid card */}
          <div className="bg-white/8 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-lg">
            {/* Image area */}
            <div className="aspect-[3/4] overflow-hidden bg-white/5">
              <img
                src={card.image}
                alt={card.caption}
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
              />
            </div>
            {/* Caption area */}
            <div className="px-4 py-3 bg-white/5 border-t border-white/10">
              <p className="font-sans text-xs text-white leading-tight text-center">
                {card.caption}
              </p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default HeroStickers;
