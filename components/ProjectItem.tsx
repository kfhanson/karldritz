import React from 'react';
import { Link } from 'react-router-dom';
import { Project } from '../types';

interface ProjectItemProps {
  project: Project;
  index: number;
  onMouseEnter: (project: Project) => void;
  onMouseLeave: () => void;
}

const ProjectItem: React.FC<ProjectItemProps> = ({ project, index, onMouseEnter, onMouseLeave }) => {
  return (
    <div 
      className="relative flex-shrink-0 w-[80vw] md:w-[45vw] h-full flex flex-col justify-center px-8 border-r border-white/10 group hover:bg-white/5 transition-colors duration-500 cursor-none"
      onMouseEnter={() => onMouseEnter(project)}
      onMouseLeave={onMouseLeave}
    >
      <Link to={`/project/${project.id}`} className="flex flex-col gap-4 z-10 w-full">
        <span className="text-sm md:text-md text-gray-500 font-mono">
          0{index + 1} / {project.year}
        </span>
        <h2 className="text-5xl md:text-7xl font-[700] uppercase font-[Syne] group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-500 transition-all duration-300">
          {project.title}
        </h2>
        <p className="text-lg md:text-xl text-gray-400 font-light">
          {project.category}
        </p>
        <div className="mt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
           <span className="border-b border-white pb-1 uppercase tracking-widest text-sm pointer-events-none">View Case Study</span>
        </div>
      </Link>
      
      {/* Decorative large background number */}
      <span className="absolute bottom-0 right-4 text-[20vw] font-[800] opacity-[0.03] leading-none select-none pointer-events-none">
        {index + 1}
      </span>
    </div>
  );
};

export default ProjectItem;