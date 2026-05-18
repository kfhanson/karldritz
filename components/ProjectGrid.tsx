import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { projects } from '../data/projects';
import { Project } from '../types';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

interface ProjectRowProps {
  project: Project;
  index: number;
  flip: boolean;
}

const ProjectRow: React.FC<ProjectRowProps> = ({ project, index, flip }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      variants={fadeUp}
      className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10 py-16 border-t border-wire"
    >
      {/* Image */}
      <div className={`md:col-span-7 overflow-hidden rounded-sm bg-panel ${flip ? 'md:order-last' : ''}`}>
        <Link to={`/project/${project.id}`} tabIndex={-1} aria-hidden>
          <img
            src={project.image}
            alt={project.title}
            loading="lazy"
            className="w-full h-[280px] md:h-[420px] object-cover hover:scale-[1.02] transition-transform duration-500"
          />
        </Link>
      </div>

      {/* Meta */}
      <div className={`md:col-span-5 flex flex-col justify-between py-2 ${flip ? 'md:order-first' : ''}`}>
        <div>
          <p className="font-mono text-xs text-ink-muted mb-4">
            {String(index + 1).padStart(2, '0')} — {project.year}
          </p>
          <Link to={`/project/${project.id}`}>
            <h2 className="font-display text-4xl md:text-5xl text-ink leading-tight mb-4 hover:text-pine transition-colors duration-200">
              {project.title}
            </h2>
          </Link>
          <p className="font-sans text-sm text-ink-muted leading-relaxed mb-6">
            {project.description}
          </p>
          <p className="font-mono text-xs text-ink-muted">
            {project.techStack?.slice(0, 4).join(' · ')}
          </p>
        </div>
        <Link
          to={`/project/${project.id}`}
          className="mt-8 inline-flex items-center gap-2 font-sans text-sm text-ink border-b border-ink pb-0.5 self-start hover:text-pine hover:border-pine transition-colors duration-200"
        >
          View case study <span aria-hidden="true">→</span>
        </Link>
      </div>
    </motion.div>
  );
};

interface SmallCardProps {
  project: Project;
  index: number;
}

const SmallCard: React.FC<SmallCardProps> = ({ project, index }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      variants={fadeUp}
    >
      <Link to={`/project/${project.id}`} className="group block">
        <div className="overflow-hidden rounded-sm bg-panel mb-4">
          <img
            src={project.image}
            alt={project.title}
            loading="lazy"
            className="w-full h-[200px] object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        </div>
        <p className="font-mono text-xs text-ink-muted mb-2">
          {String(index + 1).padStart(2, '0')} — {project.year}
        </p>
        <h3 className="font-display text-2xl text-ink mb-1 group-hover:text-pine transition-colors duration-200">
          {project.title}
        </h3>
        <p className="font-sans text-xs text-ink-muted">{project.category}</p>
      </Link>
    </motion.div>
  );
};

const ProjectGrid: React.FC = () => {
  const featured = projects.filter(p => p.featured && !p.hidden);
  const supporting = projects.filter(p => !p.featured && !p.hidden);

  return (
    <section className="px-6 md:px-10 lg:px-16 py-24 max-w-[1280px] mx-auto">
      <div className="flex items-baseline justify-between mb-0">
        <h2 className="font-display text-2xl text-ink">Selected Work</h2>
        <span className="font-mono text-xs text-ink-muted">
          {featured.length + supporting.length} projects
        </span>
      </div>

      {/* Featured rows — alternating layout */}
      <div>
        {featured.map((project, i) => (
          <ProjectRow key={project.id} project={project} index={i} flip={i % 2 === 1} />
        ))}
      </div>

      {/* Supporting grid */}
      {supporting.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-16 border-t border-wire">
          {supporting.map((project, i) => (
            <SmallCard key={project.id} project={project} index={featured.length + i} />
          ))}
        </div>
      )}
    </section>
  );
};

export default ProjectGrid;
