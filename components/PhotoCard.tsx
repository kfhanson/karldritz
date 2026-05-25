import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const huaweiSummit = new URL('../images/photocards/huawei-summit.jpeg', import.meta.url).href;
const apacFinalist = new URL('../images/photocards/apac-finalist.jpeg', import.meta.url).href;
const alibabaHackathon = new URL('../images/photocards/alibaba-hackathon.jpeg', import.meta.url).href;

const PHOTOS = [
  { id: 'apac-finalist',     image: apacFinalist },
  { id: 'huawei-summit',     image: huaweiSummit },
  { id: 'alibaba-hackathon', image: alibabaHackathon },
];

const PhotoCard: React.FC = () => {
  const [index, setIndex] = useState(0);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.35 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      onClick={() => setIndex(i => (i + 1) % PHOTOS.length)}
      className="cursor-pointer select-none"
      style={{ width: 268 }}
    >
      <div className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden shadow-lg">
        <div className="relative aspect-[3/4] overflow-hidden bg-white/5">
          <AnimatePresence mode="wait">
            <motion.img
              key={PHOTOS[index].id}
              src={PHOTOS[index].image}
              alt=""
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

export default PhotoCard;
