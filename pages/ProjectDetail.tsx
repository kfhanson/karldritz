import React, { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { projects } from '../data/projects';

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const project = projects.find(p => p.id === Number(id));

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        <div className="text-center">
          <h2 className="text-2xl font-[Syne]">Project Not Found</h2>
          <button onClick={() => navigate('/')} className="mt-4 border-b border-white">Return Home</button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen bg-[#0a0a0a] text-white pt-32 pb-24 px-8 md:px-24"
    >
      <Link to="/" className="fixed top-24 left-8 md:top-32 md:left-24 z-40 mix-blend-difference text-sm uppercase tracking-widest hover:opacity-70 transition-opacity">
        ← Back
      </Link>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-24">
          <span className="block text-gray-500 font-mono mb-4">0{project.id} — {project.category}</span>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-[Syne] font-bold uppercase leading-[0.9] mb-12">
            {project.title}
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 border-t border-white/20 pt-8">
            <div>
              <h5 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Role</h5>
              <p className="text-lg">{project.role || "Developer"}</p>
            </div>
            <div>
              <h5 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Year</h5>
              <p className="text-lg">{project.year}</p>
            </div>
            <div>
              <h5 className="text-xs uppercase tracking-widest text-gray-500 mb-2">Stack</h5>
              <p className="text-lg leading-relaxed">{project.techStack?.join(", ")}</p>
            </div>
            <div className="flex items-start justify-start md:justify-end gap-4">
              {project.link && (
                <a href={project.link} target="_blank" rel="noreferrer" className="px-6 py-3 border border-white/20 rounded-full hover:bg-white hover:text-black transition-colors text-sm uppercase tracking-wider">
                  Live Site
                </a>
              )}
               {project.github && (
                <a href={project.github} target="_blank" rel="noreferrer" className="px-6 py-3 border border-white/20 rounded-full hover:bg-white hover:text-black transition-colors text-sm uppercase tracking-wider">
                  GitHub
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Hero Image */}
        <div className="w-full h-[60vh] md:h-[80vh] bg-gray-900 overflow-hidden mb-24 rounded-lg">
          <img 
            src={project.image} 
            alt={project.title} 
            className="w-full h-full object-cover opacity-80"
          />
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-8 md:col-start-3">
             <h3 className="text-2xl font-[Syne] mb-8">About the project</h3>
             <div className="space-y-6 text-lg md:text-xl font-light leading-relaxed text-gray-300">
                {project.fullDescription ? (
                  project.fullDescription.map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))
                ) : (
                  <p>{project.description}</p>
                )}
             </div>
          </div>
        </div>

        {/* Next Project (Simple Navigation) */}
        <div className="mt-32 pt-16 border-t border-white/10 flex justify-between items-center">
           <span className="text-gray-500 text-sm uppercase tracking-widest">Next Project</span>
           <Link 
             to={`/project/${project.id === projects.length ? 1 : project.id + 1}`}
             className="text-2xl md:text-4xl font-[Syne] font-bold hover:opacity-70 transition-opacity"
           >
              {projects.find(p => p.id === (project.id === projects.length ? 1 : project.id + 1))?.title} →
           </Link>
        </div>

      </div>
    </motion.div>
  );
};

export default ProjectDetail;