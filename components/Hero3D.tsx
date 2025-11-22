
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Brain, Code, Database, Cloud, Move } from 'lucide-react';

// --- 1. Floating Particles with Repulsion ---

interface ParticleProps {
  count: number;
  color: string;
  size: number;
}

function FloatingParticles({ count, color, size }: ParticleProps) {
  const mesh = useRef<THREE.Points>(null);
  const { viewport, mouse } = useThree();
  
  const dummy = useMemo(() => new THREE.Vector3(), []);
  
  // Generate initial positions and velocities
  const particles = useMemo(() => {
    const p = new Float32Array(count * 3);
    const v = new Float32Array(count * 3); // velocities
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 20; // Spread wide
      const y = (Math.random() - 0.5) * 15;
      const z = (Math.random() - 0.5) * 10;
      p.set([x, y, z], i * 3);
      
      // Random upward drift speed
      v[i] = Math.random() * 0.02 + 0.005; 
    }
    return { positions: p, velocities: v };
  }, [count]);

  useFrame((state) => {
    if (!mesh.current) return;
    
    const positions = mesh.current.geometry.attributes.position.array as Float32Array;
    const time = state.clock.getElapsedTime();

    // Convert normalized mouse (-1 to 1) to world coordinates roughly
    // At z=0, world x is viewport.width/2 * mouse.x
    const mouseX = (mouse.x * viewport.width) / 2;
    const mouseY = (mouse.y * viewport.height) / 2;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // 1. Natural Floating Motion (Upward)
      positions[i3 + 1] += particles.velocities[i];
      
      // Reset if too high
      if (positions[i3 + 1] > 8) {
        positions[i3 + 1] = -8;
        positions[i3] = (Math.random() - 0.5) * 20; // Randomize X on reset
      }

      // 2. Interaction: Repel from Mouse/Sticker
      const dx = positions[i3] - mouseX;
      const dy = positions[i3 + 1] - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const repulsionRadius = 3;
      
      if (dist < repulsionRadius) {
        const force = (1 - dist / repulsionRadius) * 0.5; // Strength
        positions[i3] += (dx / dist) * force;
        positions[i3 + 1] += (dy / dist) * force;
      } else {
         // Return to subtle drift (optional: could implement spring back, 
         // but free floating is cleaner for this look)
      }
      
      // Gentle sine wave sway on X
      positions[i3] += Math.sin(time * 0.5 + positions[i3+1]) * 0.002;
    }
    
    mesh.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// --- 2. Draggable Stickers Logic ---

interface StickerData {
  id: number;
  x: number;
  y: number;
  content: React.ReactNode;
  rotation: number;
  bg: string;
}

const DraggableSticker: React.FC<{ data: StickerData }> = ({ data }) => {
  const [pos, setPos] = useState({ x: data.x, y: data.y });
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(data.rotation);

  // When dragging starts
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    // Calculate offset from the element's top-left to the cursor
    setOffset({
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    });
    // Reset rotation for a "picked up" feel
    setRotation(0);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPos({
          x: e.clientX - offset.x,
          y: e.clientY - offset.y
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        // Randomize rotation slightly on drop for natural feel
        setRotation((Math.random() - 0.5) * 10);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, offset]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute cursor-grab active:cursor-grabbing shadow-lg hover:shadow-xl hover:shadow-cyan-500/20 transition-shadow rounded-xl border border-slate-200/50 backdrop-blur-sm select-none z-20 flex items-center justify-center p-4 gap-3 ${data.bg}`}
      style={{
        left: pos.x,
        top: pos.y,
        transform: `rotate(${rotation}deg) scale(${isDragging ? 1.1 : 1})`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }}
    >
      <div className="opacity-80 text-slate-700">
        {data.content}
      </div>
      <div className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-sm opacity-0 hover:opacity-100 transition-opacity text-slate-400">
        <Move size={10} />
      </div>
    </div>
  );
};

export const Hero3D: React.FC = () => {
  const [stickers, setStickers] = useState<StickerData[]>([]);

  useEffect(() => {
    // Initialize sticker positions safely on client side
    // Using percentages of window size to keep them responsive-ish
    const w = window.innerWidth;
    const h = window.innerHeight;

    setStickers([
        { 
            id: 1, 
            x: w * 0.15, 
            y: h * 0.65, 
            rotation: -5, 
            bg: "bg-white/90",
            content: <div className="flex items-center gap-2 font-bold text-sm"><Brain className="text-cyan-500" size={18}/> AI Native</div> 
        },
        { 
            id: 2, 
            x: w * 0.75, 
            y: h * 0.2, 
            rotation: 8, 
            bg: "bg-cyan-50/90",
            content: <div className="flex items-center gap-2 font-bold text-sm"><Code className="text-blue-500" size={18}/> Python Expert</div> 
        },
        { 
            id: 3, 
            x: w * 0.8, 
            y: h * 0.7, 
            rotation: -3, 
            bg: "bg-slate-50/90",
            content: <div className="flex items-center gap-2 font-bold text-sm"><Cloud className="text-indigo-500" size={18}/> Cloud Arch.</div> 
        },
        { 
            id: 4, 
            x: w * 0.1, 
            y: h * 0.25, 
            rotation: 12, 
            bg: "bg-white/90",
            content: <div className="flex items-center gap-2 font-bold text-sm"><Database className="text-slate-500" size={18}/> Data Science</div> 
        }
    ]);
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      {/* 3D Background Layer */}
      <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
        <ambientLight intensity={1} />
        <fog attach="fog" args={['#ffffff', 5, 20]} />
        
        {/* Background Dust */}
        <FloatingParticles count={2000} color="#cbd5e1" size={0.03} />
        {/* Mid-Layer Data */}
        <FloatingParticles count={800} color="#94a3b8" size={0.06} />
        {/* Accent Data (Cyan) */}
        <FloatingParticles count={150} color="#06b6d4" size={0.09} />
      </Canvas>
      
      {/* 2D Draggable Layer */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Pointer events auto is handled by the stickers themselves */}
        <div className="pointer-events-auto w-full h-full relative">
            {stickers.map(sticker => (
                <DraggableSticker key={sticker.id} data={sticker} />
            ))}
        </div>
      </div>
    </div>
  );
};
