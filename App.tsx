import React, { useState } from 'react';
import { Hero3D } from './components/Hero3D';
import { Section } from './components/Section';
import { NeuralLinkGame } from './components/NeuralLinkGame';
import { BRAND, PROJECTS, EXPERIENCE, SKILLS, CERTIFICATIONS, PUBLICATIONS } from './constants';
import { Github, Linkedin, Mail, ChevronDown, Terminal, BookOpen, Award, Dumbbell } from 'lucide-react';
import { SectionId } from './types';

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-cyan-100 selection:text-cyan-900 font-sans">
      {/* Navigation - Centered & Minimal */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-center relative">
          
          {/* Desktop Nav */}
          <div className="hidden md:flex gap-8 text-xs font-bold tracking-widest uppercase text-slate-500 font-['Space_Grotesk']">
            {Object.values(SectionId).map((id) => (
              <button 
                key={id} 
                onClick={() => scrollTo(id)} 
                className="hover:text-cyan-600 transition-colors duration-300"
              >
                {id}
              </button>
            ))}
          </div>

          {/* Mobile Nav Toggle */}
          <div className="md:hidden absolute right-6">
             <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-900 font-bold uppercase text-xs tracking-widest">
               {mobileMenuOpen ? 'Close' : 'Menu'}
             </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
           <div className="md:hidden bg-white border-b border-slate-200 p-4 flex flex-col items-center gap-6 py-8 shadow-lg">
             {Object.values(SectionId).map((id) => (
              <button 
                key={id} 
                onClick={() => scrollTo(id)} 
                className="text-slate-600 hover:text-cyan-600 transition-colors uppercase tracking-widest text-sm font-bold"
              >
                {id}
              </button>
            ))}
           </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id={SectionId.Hero} className="relative h-screen flex items-center justify-center overflow-hidden pt-16">
        <Hero3D />
        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto pointer-events-none">
          <div className="pointer-events-auto"> {/* Enable interaction for buttons/text */}
            <h1 className="text-5xl md:text-8xl font-bold mb-8 tracking-tighter leading-none font-['Space_Grotesk'] text-slate-900 drop-shadow-sm">
              <span className="">Karldritz</span>{' '}
              <span className="text-slate-400">Farrel</span>{' '}
              <br className="md:hidden" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">Hanson</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-500 mb-10 font-normal tracking-wide max-w-2xl mx-auto">
              {BRAND.tagline}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button 
                onClick={() => scrollTo(SectionId.Projects)}
                className="px-8 py-3 bg-slate-900 text-white hover:bg-cyan-600 rounded-lg font-bold transition-all shadow-lg hover:shadow-cyan-500/30"
              >
                Explore Work
              </button>
              <button 
                onClick={() => scrollTo(SectionId.Game)}
                className="px-8 py-3 border border-slate-300 bg-white/50 backdrop-blur text-slate-600 hover:text-cyan-600 hover:border-cyan-500 rounded-lg font-bold transition-all"
              >
                Calibrate Neural Net
              </button>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-slate-400">
          <ChevronDown size={24} />
        </div>
      </section>

      {/* About Me */}
      <Section id={SectionId.About} className="relative">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 relative z-10">
             <h2 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3 tracking-tight font-['Space_Grotesk']">
               About <span className="text-cyan-500">.</span>
             </h2>
             <p className="text-slate-600 leading-loose text-lg">
               I am a Computer Science student at <strong className="text-slate-900">BINUS University</strong> and a <strong className="text-slate-900">Solution Architect</strong> at Huawei Cloud Indonesia. 
               My academic journey, enriched by a semester at Chang Gung University in Taiwan, has fueled my passion for 
               bridging theoretical AI concepts with practical, scalable cloud solutions.
             </p>
             <p className="text-slate-600 leading-loose text-lg">
                Beyond the code, I find balance in the gym. Physical discipline mirrors the iterative optimization required in Machine Learning—consistency 
                and gradual improvement lead to the best results.
             </p>
             
             {/* Certifications Mini-section */}
             <div className="pt-6">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2 font-['Space_Grotesk']">
                  <Award size={16} className="text-cyan-500"/> Certifications
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {CERTIFICATIONS.map((cert, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-cyan-400 transition-colors">
                      <span className="text-slate-700 text-sm font-medium">{cert.name}</span>
                      <span className="text-slate-500 text-xs bg-white px-2 py-1 rounded border border-slate-200">{cert.year}</span>
                    </div>
                  ))}
                </div>
             </div>

             <div className="flex gap-4 pt-4">
                <div className="flex items-center gap-2 bg-cyan-50 px-4 py-2 rounded-full border border-cyan-100 text-cyan-700">
                   <Terminal size={16} />
                   <span className="text-sm font-bold">Solution Architect</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full border border-blue-100 text-blue-700">
                   <Dumbbell size={16} />
                   <span className="text-sm font-bold">Fitness Enthusiast</span>
                </div>
             </div>
          </div>
          
          {/* Image / Abstract shape */}
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200 shadow-2xl group bg-slate-100">
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-100/50 to-blue-100/50 group-hover:opacity-0 transition-opacity duration-500 z-10"></div>
              {/* Placeholder for user image */}
              <img 
                src="https://picsum.photos/800/1000?grayscale" 
                alt="Karldritz Farrel Hanson" 
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 mix-blend-multiply"
              />
              
              {/* Decorative Elements */}
              <div className="absolute bottom-4 right-4 z-20 flex gap-1">
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-100"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse delay-200"></div>
              </div>
          </div>
        </div>
      </Section>

      {/* Projects */}
      <Section id={SectionId.Projects} className="bg-slate-50/50">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-16 flex items-center gap-3 tracking-tight font-['Space_Grotesk']">
          Selected Projects <span className="text-cyan-500">.</span>
        </h2>
        <div className="grid gap-20">
          {PROJECTS.map((project, idx) => (
            <div key={project.id} className={`group grid md:grid-cols-12 gap-8 items-center ${idx % 2 === 1 ? 'md:text-right' : ''}`}>
              <div className={`md:col-span-6 ${idx % 2 === 1 ? 'md:order-2' : 'md:order-1'}`}>
                 <div className="aspect-video w-full bg-white border border-slate-200 rounded-xl overflow-hidden relative shadow-xl group-hover:shadow-cyan-500/20 transition-all">
                    <div className="absolute inset-0 bg-slate-900/10 group-hover:bg-transparent transition-all duration-500 z-10"></div>
                    <img 
                      src={project.image ?? `https://picsum.photos/seed/${project.id}/800/500?grayscale`} 
                      alt={project.title} 
                      className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 transform group-hover:scale-105"
                    />
                 </div>
              </div>
              
              <div className={`md:col-span-6 space-y-4 ${idx % 2 === 1 ? 'md:order-1 flex flex-col items-end' : 'md:order-2'}`}>
                 <h3 className="text-3xl font-bold text-slate-900 group-hover:text-cyan-600 transition-colors font-['Space_Grotesk']">
                   {project.title}
                 </h3>
                 <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 font-['Space_Grotesk']">
                    <span>{project.role}</span>
                    <span className="text-cyan-500">•</span>
                    <span>{project.technologies[0]}</span>
                 </div>
                 <p className="text-slate-600 leading-relaxed text-lg">
                   {project.description}
                 </p>
                 
                 <div className={`py-3 border-l-4 border-cyan-500 bg-white pl-4 pr-2 rounded-r-lg my-4 w-fit shadow-sm ${idx % 2 === 1 ? 'border-l-0 border-r-4 pl-2 pr-4 rounded-l-lg rounded-r-none text-right' : ''}`}>
                    <p className="text-slate-700 text-sm italic">
                       "{project.impact}"
                    </p>
                 </div>

                 <div className="flex flex-wrap gap-2 pt-2">
                   {project.technologies.map(tech => (
                     <span key={tech} className="text-[10px] uppercase font-bold px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-md hover:border-cyan-400 hover:text-cyan-700 transition-colors">
                       {tech}
                     </span>
                   ))}
                 </div>
                 
                 {project.githubUrl && (
                   <div className="pt-4">
                     <a href={project.githubUrl} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-600 transition-colors group/link">
                       <Github size={18} /> 
                       <span className="border-b border-transparent group-hover/link:border-cyan-600">View Codebase</span>
                     </a>
                   </div>
                 )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Publications Section */}
      <Section id="publications" className="my-10">
         <h2 className="text-2xl font-bold text-slate-900 mb-10 flex items-center gap-3 tracking-tight font-['Space_Grotesk']">
          Publications <span className="text-cyan-500">.</span>
        </h2>
        <div className="space-y-6">
           {PUBLICATIONS.map((pub, idx) => (
             <div key={idx} className="bg-white border border-slate-200 p-8 rounded-2xl hover:border-cyan-400 hover:shadow-lg transition-all hover:-translate-y-1 group">
                <div className="flex items-start gap-6">
                   <div className="p-3 bg-cyan-50 rounded-full text-cyan-600 hidden sm:block group-hover:bg-cyan-100 transition-colors">
                      <BookOpen size={24} />
                   </div>
                   <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2 font-['Space_Grotesk']">{pub.title}</h3>
                      <p className="text-slate-500 text-sm mb-2 font-medium uppercase tracking-wide">{pub.conference} <span className="text-slate-300">|</span> {pub.year}</p>
                      <p className="text-slate-600 text-sm mb-3">{pub.authors}</p>
                      {pub.doi && (
                        <span className="inline-block text-xs text-cyan-700 bg-cyan-50 px-2 py-1 rounded font-mono border border-cyan-100">DOI: {pub.doi}</span>
                      )}
                   </div>
                </div>
             </div>
           ))}
        </div>
      </Section>

      {/* Game Section - Kept dark for contrast as a "terminal/console" area */}
      <Section id={SectionId.Game} className="bg-slate-900 text-white rounded-3xl my-20 overflow-hidden relative">
        {/* Background accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
        
        <div className="grid lg:grid-cols-3 gap-12 items-center relative z-10">
           <div className="lg:col-span-1 space-y-6">
              <h2 className="text-4xl font-bold text-white font-['Space_Grotesk']">Calibration <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Protocol</span></h2>
              <p className="text-slate-300 leading-relaxed">
                In machine learning, parameters must be tuned with precision to achieve convergence. 
              </p>
              <p className="text-slate-200 text-sm border-l-2 border-cyan-500 pl-4">
                <strong>Mission:</strong> Synchronize the signal with the target node. Precise timing optimizes the network.
              </p>
              <div className="text-xs text-slate-500 uppercase tracking-widest mt-8 font-bold">
                Portfolio Link <br/>
                "Precision and optimization drive effective AI."
              </div>
           </div>
           <div className="lg:col-span-2">
              <NeuralLinkGame />
           </div>
        </div>
      </Section>

      {/* Skills */}
      <Section id={SectionId.Skills}>
         <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-16 flex items-center gap-3 tracking-tight font-['Space_Grotesk']">
          Tech Stack <span className="text-cyan-500">.</span>
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {SKILLS.map((skillGroup) => (
            <div key={skillGroup.category} className="bg-white p-6 rounded-xl border border-slate-200 hover:border-cyan-400 hover:shadow-lg transition-all group">
               <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6 group-hover:text-cyan-600 transition-colors">
                 {skillGroup.category}
               </h3>
               <ul className="space-y-3">
                 {skillGroup.items.map(item => (
                   <li key={item} className="text-slate-600 text-sm flex items-center gap-3 group/item cursor-default">
                     <span className="w-1.5 h-1.5 bg-slate-300 rounded-full group-hover/item:bg-cyan-500 transition-colors"></span>
                     <span className="group-hover/item:text-slate-900 transition-colors font-medium">{item}</span>
                   </li>
                 ))}
               </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Experience */}
      <Section id={SectionId.Experience} className="bg-slate-50/80">
         <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-16 flex items-center gap-3 tracking-tight font-['Space_Grotesk']">
          Career Trajectory <span className="text-cyan-500">.</span>
        </h2>
        <div className="relative border-l-2 border-slate-300 ml-3 space-y-16">
           {EXPERIENCE.map((job, idx) => (
             <div key={job.id} className="relative pl-10 group">
               {/* Timeline Dot */}
               <div className="absolute -left-[9px] top-2 w-4 h-4 rounded-full bg-white border-2 border-slate-400 group-hover:border-cyan-500 group-hover:scale-125 transition-all shadow-sm"></div>
               
               <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-2">
                 <h3 className="text-2xl font-bold text-slate-900 font-['Space_Grotesk'] group-hover:text-cyan-700 transition-colors">{job.role}</h3>
                 <span className="text-sm font-bold font-mono text-slate-600 bg-white border border-slate-200 px-3 py-1 rounded-full mt-2 sm:mt-0 shadow-sm">{job.period}</span>
               </div>
               
               <div className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">{job.company}</div>
               
               <p className="text-slate-600 leading-relaxed max-w-3xl text-lg font-light">
                 {job.description}
               </p>
             </div>
           ))}
        </div>
      </Section>

      {/* Contact */}
      <Section id={SectionId.Contact} className="mb-20">
        <div className="bg-slate-900 p-12 md:p-24 text-center rounded-3xl relative overflow-hidden group shadow-2xl">
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent opacity-70"></div>
           
           <h2 className="text-4xl md:text-6xl font-bold text-white mb-8 relative z-10 font-['Space_Grotesk']">
             Initialize <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Connection</span>
           </h2>
           
           <div className="flex flex-col sm:flex-row justify-center gap-6 relative z-10 mt-12">
             <a 
               href={`mailto:${BRAND.email}`}
               className="flex items-center justify-center gap-3 px-10 py-4 bg-white hover:bg-cyan-50 text-slate-900 font-bold text-sm uppercase tracking-widest rounded-xl transition-all shadow-lg hover:scale-105"
             >
               <Mail size={18} />
               Email Me
             </a>
             <a 
               href={BRAND.linkedin}
               target="_blank"
               rel="noopener noreferrer"
               className="flex items-center justify-center gap-3 px-10 py-4 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-white font-bold text-sm uppercase tracking-widest rounded-xl transition-all hover:bg-slate-800"
             >
               <Linkedin size={18} />
               LinkedIn
             </a>
           </div>
        </div>
      </Section>

      <footer className="py-8 text-center text-slate-400 text-xs uppercase tracking-widest bg-white border-t border-slate-100 font-bold">
        <p>&copy; {new Date().getFullYear()} {BRAND.name}. Engineered in React & Three.js.</p>
      </footer>
    </div>
  );
}

export default App;