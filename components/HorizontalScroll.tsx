import React, { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ProjectItem from './ProjectItem';
import { Project } from '../types';
import { projects } from '../data/projects';

gsap.registerPlugin(ScrollTrigger);

const HorizontalScroll: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const slider = sliderRef.current;
      
      const getScrollAmount = () => {
        if (!slider) return 0;
        let sliderWidth = slider.scrollWidth;
        return -(sliderWidth - window.innerWidth);
      };

      const tween = gsap.to(slider, {
        x: getScrollAmount,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          pin: true,
          scrub: 1,
          start: "top top",
          end: () => `+=${getScrollAmount() * -1}`, 
          invalidateOnRefresh: true,
        }
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // Floating Image Logic
  useLayoutEffect(() => {
    const updatePreviewPosition = (e: MouseEvent) => {
      if (previewRef.current) {
        gsap.to(previewRef.current, {
          x: e.clientX,
          y: e.clientY,
          duration: 0.5,
          ease: "power2.out",
          xPercent: 20, 
          yPercent: -50,
        });
      }
    };

    window.addEventListener('mousemove', updatePreviewPosition);
    return () => window.removeEventListener('mousemove', updatePreviewPosition);
  }, []);

  return (
    <div ref={sectionRef} className="relative h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Container that moves horizontally */}
      <div ref={sliderRef} className="absolute top-0 left-0 flex h-full w-fit">
        {/* Intro Card in the horizontal scroll */}
        <div className="flex-shrink-0 w-[100vw] md:w-[40vw] h-full flex flex-col justify-center px-24 border-r border-white/10">
          <h3 className="text-xl uppercase tracking-widest mb-4 text-gray-500">Selected Projects</h3>
          <p className="text-3xl font-light leading-snug">
            Research and development <br /> 
            in AI, Cloud Computing, <br />
            and Web Technologies.
          </p>
        </div>

        {projects.map((project, index) => (
          <ProjectItem 
            key={project.id} 
            project={project} 
            index={index}
            onMouseEnter={setActiveProject}
            onMouseLeave={() => setActiveProject(null)}
          />
        ))}

        {/* End Card */}
        <div className="flex-shrink-0 w-[100vw] md:w-[40vw] h-full flex flex-col justify-center items-center border-r border-white/10 bg-white text-black">
          <h2 className="text-6xl font-[Syne] font-bold uppercase text-center">
            My Socials
          </h2>
          <a href="https://linkedin.com/in/karldritz" target="_blank" rel="noreferrer" className="mt-8 text-xl border-b border-black pb-1">LinkedIn</a>
          <a href="https://github.com/kfhanson" target="_blank" rel="noreferrer" className="mt-8 text-xl border-b border-black pb-1">GitHub</a>
          <a href="https://instagram.com/kfhanson_" target="_blank" rel="noreferrer" className="mt-8 text-xl border-b border-black pb-1">Instagram</a>

        </div>
      </div>

      {/* Floating Image Preview */}
      <div 
        ref={previewRef}
        className="fixed top-0 left-0 pointer-events-none z-50 overflow-hidden rounded-lg shadow-2xl bg-[#1a1a1a]"
        style={{ 
          width: '320px', 
          height: '220px', 
          opacity: activeProject ? 1 : 0,
          scale: activeProject ? 1 : 0.8,
          transition: 'opacity 0.4s ease, scale 0.4s ease',
          visibility: activeProject ? 'visible' : 'hidden'
        }}
      >
        {activeProject && (
          <div className="relative w-full h-full">
            <img 
              src={activeProject.image} 
              alt={activeProject.title} 
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute bottom-0 left-0 p-4 bg-gradient-to-t from-black to-transparent w-full">
              <p className="text-xs text-gray-300 font-mono">{activeProject.description}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HorizontalScroll;