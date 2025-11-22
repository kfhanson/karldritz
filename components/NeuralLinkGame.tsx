import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { generateGameReward } from '../services/geminiService';
import { Activity, Zap, RotateCcw } from 'lucide-react';

// Game Constants
const TRACK_LENGTH = 10;
const SPEED = 0.12;
const TARGET_ZONE_WIDTH = 1.5;
const WIN_SCORE = 5;

interface SignalProps {
  positionX: number;
  isSuccess: boolean | null; // null = traveling, true = hit, false = miss
}

const Signal: React.FC<SignalProps> = ({ positionX, isSuccess }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.z -= 0.1;
      meshRef.current.rotation.x -= 0.1;
    }
  });

  let color = "#f8fafc"; // default white
  let scale = 0.3;

  if (isSuccess === true) {
    color = "#22d3ee"; // Cyan for success pulse (keeping one accent for feedback)
    scale = 0.5;
  } else if (isSuccess === false) {
    color = "#ef4444"; // Red for miss
    scale = 0.2;
  }

  return (
    <mesh ref={meshRef} position={[positionX, 0, 0]}>
      <icosahedronGeometry args={[scale, 1]} />
      <meshStandardMaterial 
        color={color} 
        emissive={color}
        emissiveIntensity={isSuccess === true ? 2 : 0.5}
        wireframe={true}
      />
    </mesh>
  );
};

interface TargetZoneProps {
  isLit: boolean;
}

const TargetZone: React.FC<TargetZoneProps> = ({ isLit }) => {
  return (
    <group position={[0, 0, 0]}>
       {/* Visual Markers for the zone */}
       <mesh position={[-TARGET_ZONE_WIDTH/2, 0, 0]}>
          <boxGeometry args={[0.05, 2, 0.05]} />
          <meshBasicMaterial color={isLit ? "#fff" : "#475569"} />
       </mesh>
       <mesh position={[TARGET_ZONE_WIDTH/2, 0, 0]}>
          <boxGeometry args={[0.05, 2, 0.05]} />
          <meshBasicMaterial color={isLit ? "#fff" : "#475569"} />
       </mesh>
       {/* Faint Background for zone */}
       <mesh rotation={[Math.PI/2, 0, 0]}>
          <planeGeometry args={[TARGET_ZONE_WIDTH, 1]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.05} side={THREE.DoubleSide} />
       </mesh>
    </group>
  );
};

interface GameLogicProps {
  isPlaying: boolean;
  onScore: (newScore: number) => void;
  onWin: (reward: string) => void;
}

const GameScene: React.FC<GameLogicProps> = ({ isPlaying, onScore, onWin }) => {
  const [signalPos, setSignalPos] = useState(-TRACK_LENGTH / 2);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'hit' | 'miss' | null>(null);
  const [resetTimer, setResetTimer] = useState(0);
  
  // Ref to handle keypress without re-renders
  const gameStateRef = useRef({ signalPos: -TRACK_LENGTH / 2, canClick: true, isPlaying });
  gameStateRef.current.isPlaying = isPlaying;

  useFrame((state, delta) => {
    if (!gameStateRef.current.isPlaying) return;

    // Move Signal
    if (feedback === null) {
      let newPos = signalPos + SPEED * (1 + score * 0.1); // Get slightly faster
      
      // Loop if goes off screen without click
      if (newPos > TRACK_LENGTH / 2) {
         setFeedback('miss');
         setResetTimer(0.5);
      } else {
         setSignalPos(newPos);
         gameStateRef.current.signalPos = newPos;
      }
    } else {
      // Handle Reset Timer after hit/miss
      if (resetTimer > 0) {
        setResetTimer(prev => prev - delta);
      } else {
        // Reset for next round
        setFeedback(null);
        setSignalPos(-TRACK_LENGTH / 2);
        gameStateRef.current.signalPos = -TRACK_LENGTH / 2;
        gameStateRef.current.canClick = true;
      }
    }
  });

  // Input Handler
  useEffect(() => {
    const handleInput = async () => {
      if (!gameStateRef.current.isPlaying || !gameStateRef.current.canClick || feedback !== null) return;

      const pos = gameStateRef.current.signalPos;
      gameStateRef.current.canClick = false;

      // Check if inside target zone (-width/2 to width/2)
      if (pos > -TARGET_ZONE_WIDTH/2 && pos < TARGET_ZONE_WIDTH/2) {
        // HIT
        setFeedback('hit');
        setResetTimer(0.5);
        const newScore = score + 1;
        setScore(newScore);
        onScore(newScore);

        if (newScore >= WIN_SCORE) {
           const reward = await generateGameReward();
           onWin(reward);
        }
      } else {
        // MISS
        setFeedback('miss');
        setResetTimer(0.5);
        setScore(0);
        onScore(0);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') handleInput();
    };
    
    // Mobile touch is handled by the overlay button, this is for keyboard
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [score, feedback, onScore, onWin]);

  // Expose method for button click
  if ((window as any).triggerCalibrate) {
     (window as any).triggerCalibrate = () => {
        const event = new KeyboardEvent('keydown', {'code': 'Space'});
        window.dispatchEvent(event);
     }
  }

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 5, 0]} intensity={1} />
      
      {/* The Track */}
      <line>
        <bufferGeometry>
          <float32BufferAttribute attach="attributes-position" count={2} array={new Float32Array([-TRACK_LENGTH/2, 0, 0, TRACK_LENGTH/2, 0, 0])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#334155" linewidth={1} />
      </line>

      <TargetZone isLit={feedback === 'hit'} />
      <Signal positionX={signalPos} isSuccess={feedback === 'hit' ? true : feedback === 'miss' ? false : null} />

      {/* Instructions in 3D space */}
      <Text position={[0, -1.5, 0]} fontSize={0.3} color="#64748b" anchorX="center" anchorY="middle">
        Press CALIBRATE when signal aligns
      </Text>
    </>
  );
};

export const NeuralLinkGame: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [reward, setReward] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const handleStart = () => {
    setIsPlaying(true);
    setReward(null);
    setScore(0);
  };

  const handleWin = (text: string) => {
    setIsPlaying(false);
    setReward(text);
  };

  const handleCalibrateClick = () => {
    // Dispatch space key event for simplicity to reuse logic
    window.dispatchEvent(new KeyboardEvent('keydown', {'code': 'Space'}));
  };

  const resetGame = () => {
    setReward(null);
    setScore(0);
    setGameKey(prev => prev + 1);
    setIsPlaying(false);
  };

  return (
    <div className="w-full h-[400px] relative bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
       {/* HUD */}
       <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded border border-slate-800">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
               <Activity className="w-4 h-4" />
               <span>Neural Calibrator</span>
            </div>
            <div className="text-xs text-slate-500 mt-1">Optimization Level</div>
          </div>
          
          <div className="bg-slate-900/80 backdrop-blur px-4 py-2 rounded border border-slate-800">
             <div className="flex gap-1">
                {[...Array(WIN_SCORE)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2 h-6 rounded-sm transition-all ${i < score ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-slate-800'}`}
                  ></div>
                ))}
             </div>
          </div>
       </div>

      {/* Overlay: Start Screen */}
      {!isPlaying && !reward && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
           <h3 className="text-2xl font-bold text-white mb-2">System Standby</h3>
           <p className="text-slate-400 mb-6 max-w-md text-center text-sm px-4">
             Precision is key to efficient AI. Click "Calibrate" exactly when the signal enters the center zone.
           </p>
           <button 
             onClick={handleStart}
             className="px-8 py-3 bg-slate-100 hover:bg-white text-slate-950 font-bold rounded transition-all hover:scale-105"
           >
             Initialize Sequence
           </button>
        </div>
      )}

      {/* Overlay: Win Screen */}
      {reward && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/95 p-8 text-center animate-in fade-in duration-500">
           <div className="mb-4 text-green-400">
             <Zap className="w-12 h-12 mx-auto mb-2" />
             <h3 className="text-xl font-bold uppercase tracking-widest">Network Optimized</h3>
           </div>
           <p className="text-lg text-slate-300 italic mb-8 max-w-lg border-l-2 border-slate-700 pl-4">
             "{reward}"
           </p>
           <button 
            onClick={resetGame}
            className="flex items-center gap-2 px-6 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded transition-colors"
           >
             <RotateCcw className="w-4 h-4" /> Recalibrate
           </button>
        </div>
      )}

      {/* Controls Area (Bottom) */}
      {isPlaying && (
        <div className="absolute bottom-6 left-0 w-full flex justify-center z-20">
           <button 
             onClick={handleCalibrateClick}
             className="px-12 py-4 bg-slate-100 active:bg-slate-300 text-slate-950 font-bold tracking-widest rounded shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all active:scale-95"
           >
             CALIBRATE
           </button>
        </div>
      )}

      <Canvas camera={{ position: [0, 2, 5], fov: 45 }}>
        <GameScene 
          key={gameKey} 
          isPlaying={isPlaying} 
          onScore={setScore} 
          onWin={handleWin} 
        />
      </Canvas>
    </div>
  );
};