import React from 'react';
import { motion } from 'framer-motion';

const About: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen pt-32 px-8 md:px-24 pb-24 max-w-7xl mx-auto"
    >
      <h1 className="text-6xl md:text-8xl font-[Syne] font-bold uppercase mb-16">Profile</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-12 gap-16">
        
        {/* Left Column: Bio & Contact */}
        <div className="md:col-span-4 flex flex-col gap-12">
          <div>
            <h3 className="uppercase tracking-widest text-sm text-gray-500 mb-4">About Me</h3>
            <p className="text-lg font-light leading-relaxed text-gray-300">
              I am Karldritz Farrel Hanson, a Computer Science student and Solution Architect Intern based in Jakarta, Indonesia. 
              I specialize in Cloud Computing, AI, and Machine Learning, with a passion for building efficient and scalable solutions.
            </p>
          </div>
          
          <div>
            <h3 className="uppercase tracking-widest text-sm text-gray-500 mb-4">Contact</h3>
            <ul className="space-y-2 text-gray-300">
              <li>Jakarta, Indonesia</li>
              <li><a href="mailto:kfhanson.2508@gmail.com" className="hover:text-white transition-colors">kfhanson.2508@gmail.com</a></li>
              <li><a href="https://linkedin.com/in/karldritz" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">LinkedIn/karldritz</a></li>
              <li><a href="https://github.com/kfhanson" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub/kfhanson</a></li>
            </ul>
          </div>

          <div>
             <h3 className="uppercase tracking-widest text-sm text-gray-500 mb-4">Education</h3>
             <div className="mb-6">
                <h4 className="text-white font-medium">BINUS University</h4>
                <p className="text-gray-400 text-sm">Bachelor, Computer Science (3.66/4.0 GPA)</p>
                <p className="text-gray-500 text-xs mt-1">Sep 2022 - June 2026</p>
             </div>
             <div>
                <h4 className="text-white font-medium">Chang Gung University (Taiwan)</h4>
                <p className="text-gray-400 text-sm">Study Abroad Program (4.0/4.0 GPA)</p>
                <p className="text-gray-500 text-xs mt-1">Spring 2025</p>
             </div>
          </div>
        </div>
        
        {/* Right Column: Experience & Skills */}
        <div className="md:col-span-8 flex flex-col gap-16">
          
          {/* Experience Section */}
          <section>
            <h3 className="text-2xl font-[Syne] font-bold uppercase border-b border-white/20 pb-4 mb-8">Experience</h3>
            
            <div className="space-y-12">
              <div className="group">
                <div className="flex justify-between items-baseline mb-2">
                  <h4 className="text-xl font-medium group-hover:text-gray-300 transition-colors">Huawei Cloud Indonesia</h4>
                  <span className="text-sm text-gray-500 font-mono">Sep 2025 - Present</span>
                </div>
                <p className="text-gray-400 mb-2 italic">Solution Architect Intern</p>
                <ul className="list-disc list-outside ml-4 text-gray-400 font-light space-y-1 text-sm leading-relaxed">
                  <li>Analyze customer requirements and design efficient, cost-effective cloud solution architectures.</li>
                  <li>Participated in customer migration projects from GCP to Huawei Cloud.</li>
                </ul>
              </div>

              <div className="group">
                <div className="flex justify-between items-baseline mb-2">
                  <h4 className="text-xl font-medium group-hover:text-gray-300 transition-colors">HIMTI (Student Association)</h4>
                  <span className="text-sm text-gray-500 font-mono">2023 - 2025</span>
                </div>
                <p className="text-gray-400 mb-2 italic">Academic Events Activist</p>
                <ul className="list-disc list-outside ml-4 text-gray-400 font-light space-y-1 text-sm leading-relaxed">
                  <li>Chairman of HILET 2024. Led and coordinated the event.</li>
                  <li>Assisted in seminars, workshops, and organizational events.</li>
                </ul>
              </div>

              <div className="group">
                <div className="flex justify-between items-baseline mb-2">
                  <h4 className="text-xl font-medium group-hover:text-gray-300 transition-colors">BINUS University</h4>
                  <span className="text-sm text-gray-500 font-mono">Sep 2024 - Jan 2025</span>
                </div>
                <p className="text-gray-400 mb-2 italic">Mentor (Student Advisory)</p>
                <ul className="list-disc list-outside ml-4 text-gray-400 font-light space-y-1 text-sm leading-relaxed">
                  <li>Guided mentees academically and taught course materials for improved performance.</li>
                </ul>
              </div>

              <div className="group">
                <div className="flex justify-between items-baseline mb-2">
                  <h4 className="text-xl font-medium group-hover:text-gray-300 transition-colors">Digdaya Duta Digital</h4>
                  <span className="text-sm text-gray-500 font-mono">Aug 2022 - Jan 2023</span>
                </div>
                <p className="text-gray-400 mb-2 italic">Research Intern</p>
                <ul className="list-disc list-outside ml-4 text-gray-400 font-light space-y-1 text-sm leading-relaxed">
                  <li>Analyzed e-learning platform codebase and reported on AI/ML potential for business development.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Skills Section */}
          <section>
            <h3 className="text-2xl font-[Syne] font-bold uppercase border-b border-white/20 pb-4 mb-8">Technical Skills</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h5 className="text-sm uppercase tracking-widest text-gray-500 mb-3">Languages</h5>
                <p className="text-gray-300 font-light">C, C++, Java, JavaScript, TypeScript, HTML, CSS, PHP, Python, Go, R, SQL</p>
              </div>
              <div>
                <h5 className="text-sm uppercase tracking-widest text-gray-500 mb-3">Frameworks</h5>
                <p className="text-gray-300 font-light">ReactJS, NextJS, Laravel, Tailwind, TensorFlow, PyTorch, Keras</p>
              </div>
              <div>
                <h5 className="text-sm uppercase tracking-widest text-gray-500 mb-3">Tools & Platforms</h5>
                <p className="text-gray-300 font-light">AWS, Huawei Cloud, Docker, Git, SPSS, Power BI</p>
              </div>
              <div>
                <h5 className="text-sm uppercase tracking-widest text-gray-500 mb-3">Domains</h5>
                <p className="text-gray-300 font-light">Machine Learning, Cloud Computing, Web Development, Data Science, IoT</p>
              </div>
            </div>
          </section>

          {/* Certifications & Publications */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-[Syne] font-bold uppercase border-b border-white/20 pb-4 mb-6">Certifications</h3>
              <ul className="space-y-4 text-sm font-light text-gray-300">
                <li className="flex justify-between">
                  <span>Huawei Certified ICT Associate</span>
                  <span className="text-gray-500">2025</span>
                </li>
                 <li className="flex justify-between">
                  <span>Alibaba Cloud Associate (ACA)</span>
                  <span className="text-gray-500">2024</span>
                </li>
                <li className="flex justify-between">
                  <span>NVIDIA Deep Learning Fundamentals</span>
                  <span className="text-gray-500">2024</span>
                </li>
                <li className="flex justify-between">
                  <span>IELTS 7.5 Band Score</span>
                  <span className="text-gray-500">2024</span>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-[Syne] font-bold uppercase border-b border-white/20 pb-4 mb-6">Publications</h3>
               <div className="text-sm font-light text-gray-300 leading-relaxed">
                  <p className="italic mb-2">"Simulation-Based Optimization of Autonomous Vehicles Using Genetic Algorithm"</p>
                  <p className="text-gray-500">2024 6th International Conference on Cybernetics and Intelligent System (ICORIS).</p>
               </div>
            </div>
          </section>

        </div>
      </div>
    </motion.div>
  );
};

export default About;