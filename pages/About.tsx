import React, { useEffect, useRef } from 'react';
import { motion, useInView } from 'framer-motion';

const Reveal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

const About: React.FC = () => {
  useEffect(() => {
    document.title = 'About — Karldritz Farrel Hanson';
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <main id="main-content" className="min-h-screen pt-32 px-6 md:px-10 lg:px-16 pb-24">
      <div className="max-w-[1280px] mx-auto">

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-6xl md:text-8xl text-ink mb-16 leading-[0.9]"
        >
          About
        </motion.h1>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-16 md:gap-24">

          {/* Left: Bio + Contact */}
          <div className="md:col-span-4 space-y-12">

            <Reveal>
              <p className="font-sans text-base text-ink leading-relaxed">
                I build reinforcement learning and LLM agent systems that work in the real world.
              </p>
              <p className="font-sans text-sm text-ink-muted leading-relaxed mt-4">
                Currently an AI Engineer Intern at Sertis Teknologi Indonesia, conducting extensive learning of enterprise LLMs and knowledge management from industry experts. Volunteering as Full Stack Engineer at TemuCita, building AI chatbot systems. Computer Science student at BINUS University, Jakarta — graduating June 2026 (3.77/4.0 GPA). Studied abroad at Chang Gung University, Taiwan (Spring 2025, 4.0/4.0 GPA).
              </p>
            </Reveal>

            <Reveal>
              <h3 className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-4">Based in</h3>
              <p className="font-sans text-sm text-ink">Jakarta, Indonesia</p>
            </Reveal>

            <Reveal>
              <h3 className="font-mono text-xs text-ink-muted uppercase tracking-widest mb-4">Contact</h3>
              <ul className="font-sans text-sm text-ink space-y-2">
                <li>
                  <a
                    href="mailto:kfhanson.2508@gmail.com"
                    className="hover:text-pine transition-colors duration-200 border-b border-transparent hover:border-pine pb-0.5"
                  >
                    kfhanson.2508@gmail.com
                  </a>
                </li>
                <li>
                  <a
                    href="https://linkedin.com/in/karldritz"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="LinkedIn profile (opens in new tab)"
                    className="hover:text-pine transition-colors duration-200 border-b border-transparent hover:border-pine pb-0.5"
                  >
                    LinkedIn /karldritz
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/kfhanson"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="GitHub profile (opens in new tab)"
                    className="hover:text-pine transition-colors duration-200 border-b border-transparent hover:border-pine pb-0.5"
                  >
                    GitHub /kfhanson
                  </a>
                </li>
              </ul>
            </Reveal>

          </div>

          {/* Right: Experience, Skills, Certs, Writing */}
          <div className="md:col-span-8 space-y-16">

            {/* Experience */}
            <Reveal>
              <h2 className="font-display text-2xl text-ink border-b border-wire pb-4 mb-8">
                Experience
              </h2>
              <div className="space-y-10">
                <div>
                  <div className="flex items-baseline justify-between mb-1 gap-4">
                    <h4 className="font-sans text-base font-medium text-ink">Sertis Teknologi Indonesia</h4>
                    <span className="font-mono text-xs text-ink-muted flex-shrink-0">Apr 2026 – Present</span>
                  </div>
                  <p className="font-sans text-sm text-ink-muted italic mb-3">AI Engineer Intern</p>
                  <p className="font-sans text-sm text-ink-muted leading-relaxed">
                    Conducted extensive learning of enterprise LLMs and knowledge management from industry experts.
                  </p>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-1 gap-4">
                    <h4 className="font-sans text-base font-medium text-ink">TemuCita</h4>
                    <span className="font-mono text-xs text-ink-muted flex-shrink-0">Jan 2026 – Present</span>
                  </div>
                  <p className="font-sans text-sm text-ink-muted italic mb-3">Full Stack Engineer, Volunteer</p>
                  <p className="font-sans text-sm text-ink-muted leading-relaxed">
                    Website revamp focusing on development of AI chatbot pages with integrated memory, adding RAG and context management, focusing on personalized experience for users.
                  </p>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-1 gap-4">
                    <h4 className="font-sans text-base font-medium text-ink">Huawei Cloud Indonesia</h4>
                    <span className="font-mono text-xs text-ink-muted flex-shrink-0">Sep 2025 – Mar 2026</span>
                  </div>
                  <p className="font-sans text-sm text-ink-muted italic mb-3">Solution Architect Intern</p>
                  <p className="font-sans text-sm text-ink-muted leading-relaxed">
                    Analyzed customer requirements to properly understand customers' needs and designed solution architectures to be efficient and cost-effective. Participated in customer migration project to Huawei Cloud for a major telecommunications company.
                  </p>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-1 gap-4">
                    <h4 className="font-sans text-base font-medium text-ink">Digdaya Duta Digital</h4>
                    <span className="font-mono text-xs text-ink-muted flex-shrink-0">Aug 2022 – Jan 2023</span>
                  </div>
                  <p className="font-sans text-sm text-ink-muted italic mb-3">Research Intern</p>
                  <p className="font-sans text-sm text-ink-muted leading-relaxed">
                    Analyzed the codebase of the e-learning platform and participated in development and assessment. Formed a report regarding the use of AI and ML as a potential for business development.
                  </p>
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-1 gap-4">
                    <h4 className="font-sans text-base font-medium text-ink">Cyberindo Aditama</h4>
                    <span className="font-mono text-xs text-ink-muted flex-shrink-0">May 2021 – May 2022</span>
                  </div>
                  <p className="font-sans text-sm text-ink-muted italic mb-3">Research Intern</p>
                  <p className="font-sans text-sm text-ink-muted leading-relaxed">
                    Conducted research on the behavior of students during online learning through surveys and investigation. Assembled a team to propose a solution to improve student behavior by using a learning-focused device.
                  </p>
                </div>

                <div>
                  <h4 className="font-sans text-xs font-medium text-ink-muted uppercase tracking-widest mb-4">
                    Leadership & teaching
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-sans text-sm text-ink">
                        BINUS University — Student Mentor
                      </span>
                      <span className="font-mono text-xs text-ink-muted flex-shrink-0">2024 – 2025</span>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between gap-4 mb-2">
                        <span className="font-sans text-sm text-ink">
                          HIMTI — Academic Events Activist
                        </span>
                        <span className="font-mono text-xs text-ink-muted flex-shrink-0">2023 – 2025</span>
                      </div>
                      <p className="font-sans text-sm text-ink-muted leading-relaxed">
                        Assisted and participated in multiple events, including seminars and workshops. Operated event technicals and collaborated with various parties. Chairman of HILET 2024 — led and coordinated the event.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Skills */}
            <Reveal>
              <h2 className="font-display text-2xl text-ink border-b border-wire pb-4 mb-6">
                Skills
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

                {/* Research stack — 2/3 width */}
                <div className="col-span-2 bg-white border border-wire rounded-2xl p-5">
                  <p className="font-mono text-[10px] text-ink-muted uppercase tracking-widest mb-3">Research</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['PyTorch', 'TensorFlow', 'Keras', 'Stable-Baselines3', 'RLlib', 'SUMO', 'NEAT', 'PyGame', 'LangChain', 'Scikit-learn', 'Pandas', 'NumPy', 'Weights & Biases'].map(t => (
                      <span key={t} className="font-mono text-[11px] bg-canvas border border-wire px-2.5 py-1 rounded-full text-ink">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Current focus — 1/3 width, pine accent */}
                <div className="col-span-1 bg-pine rounded-2xl p-5 flex flex-col justify-between min-h-[120px]">
                  <p className="font-mono text-[10px] text-white/50 uppercase tracking-widest">Focus</p>
                  <div>
                    <p className="font-display text-3xl text-white leading-tight mb-2">LLM Systems</p>
                    <p className="font-sans text-[11px] text-white/60 leading-snug">Enterprise AI · Real-world applications</p>
                  </div>
                </div>

                {/* Languages — 1/3 width */}
                <div className="col-span-1 bg-panel border border-wire/60 rounded-2xl p-5">
                  <p className="font-mono text-[10px] text-ink-muted uppercase tracking-widest mb-2">Languages</p>
                  <p className="font-display text-4xl text-ink leading-none mb-2">10+</p>
                  <p className="font-mono text-[10px] text-ink-muted leading-relaxed">
                    Python · TypeScript<br />Go · R · SQL · C · C++
                  </p>
                </div>

                {/* Systems — 2/3 width */}
                <div className="col-span-2 bg-white border border-wire rounded-2xl p-5">
                  <p className="font-mono text-[10px] text-ink-muted uppercase tracking-widest mb-3">Systems & Cloud</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['Huawei Cloud', 'AWS Lambda', 'SageMaker', 'GCP', 'Docker', 'Kubernetes', 'Git', 'GitHub Actions', 'PostgreSQL', 'MongoDB', 'Express.js', 'Nginx', 'Power BI'].map(t => (
                      <span key={t} className="font-mono text-[11px] bg-canvas border border-wire px-2.5 py-1 rounded-full text-ink">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

              </div>
            </Reveal>

            {/* Certifications */}
            <Reveal>
              <h2 className="font-display text-2xl text-ink border-b border-wire pb-4 mb-8">
                Certifications
              </h2>
              <ul className="space-y-0">
                {[
                  { name: 'Huawei Certified ICT Associate – Cloud Service', year: '2025' },
                  { name: 'Alibaba Cloud Associate (ACA) – Cloud Computing', year: '2024' },
                  { name: 'NVIDIA – Fundamentals of Deep Learning', year: '2024' },
                  { name: 'IELTS 7.5 Band Score', year: '2024' },
                ].map(cert => (
                  <li
                    key={cert.name}
                    className="flex items-baseline justify-between gap-4 border-b border-wire py-3"
                  >
                    <span className="font-sans text-sm text-ink">{cert.name}</span>
                    <span className="font-mono text-xs text-ink-muted flex-shrink-0">{cert.year}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            {/* Writing */}
            <Reveal>
              <h2 className="font-display text-2xl text-ink border-b border-wire pb-4 mb-8">
                Writing
              </h2>
              <div className="font-sans text-sm text-ink-muted leading-relaxed">
                <p className="italic text-ink mb-2">
                  "Simulation-Based Optimization of Autonomous Vehicles Using Genetic Algorithm"
                </p>
                <p className="mb-1">K. F. Hanson, K. K. Al Biruni, Anderies, A. Chowanda</p>
                <p className="mb-4">
                  2024 6th International Conference on Cybernetics and Intelligent System (ICORIS)
                </p>
                <a
                  href="https://doi.org/10.1109/ICORIS63540.2024.10903833"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="DOI link for ICORIS 2024 paper (opens in new tab)"
                  className="font-mono text-xs text-pine hover:underline"
                >
                  doi:10.1109/ICORIS63540.2024.10903833 →
                </a>
              </div>
            </Reveal>

          </div>
        </div>
      </div>
      </main>
    </motion.div>
  );
};

export default About;
