import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { projects } from '../data/projects';

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const projectIndex = projects.findIndex(p => p.id === Number(id));
  const project = projects[projectIndex];

  useEffect(() => {
    document.title = project
      ? `${project.title} — Karldritz Farrel Hanson`
      : 'Karldritz Farrel Hanson — Applied AI';
  }, [project]);

  if (!project) {
    return (
      <main id="main-content" className="h-screen flex items-center justify-center bg-canvas text-ink">
        <div className="text-center">
          <h2 className="font-display text-2xl mb-4">Project not found</h2>
          <Link
            to="/"
            className="font-sans text-sm text-ink-muted border-b border-wire hover:text-ink hover:border-ink transition-colors"
          >
            Return home
          </Link>
        </div>
      </main>
    );
  }

  const nextIndex = (projectIndex + 1) % projects.length;
  const nextProject = projects[nextIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
    <main id="main-content" className="min-h-screen bg-canvas text-ink pt-32 pb-24 px-6 md:px-10 lg:px-16">
      <div className="max-w-[1280px] mx-auto">

        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-sans text-sm text-ink-muted hover:text-ink transition-colors duration-200 mb-16"
        >
          ← Back
        </Link>

        {/* Header */}
        <header className="mb-20">
          <p className="font-mono text-xs text-ink-muted mb-4">
            {String(projectIndex + 1).padStart(2, '0')} — {project.category}
          </p>
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl text-ink leading-[0.9] mb-12">
            {project.title}
          </h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-wire pt-8">
            <div>
              <h5 className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-2">Role</h5>
              <p className="font-sans text-sm text-ink">{project.role ?? 'Developer'}</p>
            </div>
            <div>
              <h5 className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-2">Year</h5>
              <p className="font-sans text-sm text-ink">{project.year}</p>
            </div>
            <div>
              <h5 className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-2">Stack</h5>
              <p className="font-sans text-sm text-ink leading-relaxed">
                {project.techStack?.join(', ')}
              </p>
            </div>
            <div className="flex items-start justify-start md:justify-end gap-3 flex-wrap">
              {project.link && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-xs text-ink border border-wire rounded-full px-4 py-2 hover:bg-ink hover:text-canvas hover:border-ink transition-colors duration-200"
                >
                  Live site
                </a>
              )}
              {project.github && (
                <a
                  href={project.github}
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-xs text-ink border border-wire rounded-full px-4 py-2 hover:bg-ink hover:text-canvas hover:border-ink transition-colors duration-200"
                >
                  GitHub
                </a>
              )}
            </div>
          </div>
        </header>

        {/* Hero image */}
        <div className="w-full h-[50vh] md:h-[70vh] bg-panel overflow-hidden rounded-sm mb-20">
          <img
            src={project.image}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Body copy */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-24">
          <div className="md:col-span-7 md:col-start-3">
            <h3 className="font-display text-xl text-ink mb-8">About the project</h3>
            <div className="space-y-6 font-sans text-base text-ink-muted leading-relaxed">
              {project.fullDescription?.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              )) ?? <p>{project.description}</p>}
            </div>
          </div>
        </div>

        {/* Next project */}
        <div className="border-t border-wire pt-12 flex items-center justify-between">
          <span className="font-mono text-xs text-ink-muted uppercase tracking-widest">Next project</span>
          <Link
            to={`/project/${nextProject.id}`}
            className="font-display text-2xl md:text-4xl text-ink hover:text-pine transition-colors duration-200"
          >
            {nextProject.title} <span aria-hidden="true">→</span>
          </Link>
        </div>

      </div>
    </main>
    </motion.div>
  );
};

export default ProjectDetail;
