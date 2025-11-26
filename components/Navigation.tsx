import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation: React.FC = () => {
  const location = useLocation();

  const isHome = location.pathname === '/';

  return (
    <nav className="fixed top-0 left-0 w-full p-8 flex justify-between items-center z-50 mix-blend-difference text-white">
      <div className="text-xl font-bold tracking-tighter uppercase font-[Syne]">
        <Link to="/">Karldritz</Link>
      </div>
      <div className="flex gap-8 text-sm uppercase tracking-widest">
        <Link 
          to="/" 
          className={`hover:opacity-100 transition-opacity ${isHome ? 'opacity-100 border-b border-white' : 'opacity-60'}`}
        >
          Work
        </Link>
        <Link 
          to="/about" 
          className={`hover:opacity-100 transition-opacity ${!isHome ? 'opacity-100 border-b border-white' : 'opacity-60'}`}
        >
          About
        </Link>
      </div>
    </nav>
  );
};

export default Navigation;