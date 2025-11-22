import { Project, ExperienceItem, SkillCategory, Publication, Certification } from './types';

export const BRAND = {
  name: "Karldritz Farrel Hanson",
  tagline: "Empowering Innovation through Machine Learning",
  email: "kfhanson.2508@gmail.com",
  linkedin: "https://linkedin.com/in/karldritz",
  github: "https://github.com/kfhanson",
};

export const PROJECTS: Project[] = [
  {
    id: 'flowai',
    title: 'FlowAI',
    description: 'Grand finalist project for Huawei Developer Competition 2025 APAC. Developed a Multi-Agent Reinforcement Learning (MARL) system to control city-wide traffic corridors, trained on Huawei Cloud and simulated in SUMO.',
    technologies: ['Python', 'Huawei Cloud', 'Reinforcement Learning', 'SUMO', 'IoT'],
    role: 'Lead AI Engineer',
    impact: 'Final Pitching at Hong Kong; implemented MARL for complete traffic control.',
    githubUrl: '#'
  },
  {
    id: 'autovehicle',
    title: 'Autonomous Vehicle Training Simulation',
    description: 'Research-purposed program training vehicles through generations using NEAT (NeuroEvolution of Augmenting Topologies) and Genetic Algorithms within a PyGame interface.',
    technologies: ['Python', 'NEAT', 'Genetic Algorithms', 'PyGame', 'Neural Networks'],
    role: 'Researcher',
    impact: 'Demonstrated evolutionary strategies for autonomous navigation; lead to a conference publication.',
    githubUrl: '#'
  },
  {
    id: 'awsllm',
    title: 'AWS-based LLM Assistant',
    description: 'Serverless AI assistant using AWS Lambda to query a Large Language Model hosted on Amazon SageMaker. Capable of answering video game questions and fetching pricing data from S3.',
    technologies: ['Python', 'AWS Lambda', 'Amazon SageMaker', 'S3', 'LLM'],
    role: 'Cloud Developer',
    impact: 'Seamless integration of serverless architecture with generative AI.',
    githubUrl: 'https://github.com/kfhanson'
  },
  {
    id: 'traffic',
    title: 'Intelligent Traffic Signal Control',
    description: 'Traffic Light agent implementing edge computing devices (IoT) using an offline deep reinforcement learning framework for agent training in SUMO simulations.',
    technologies: ['Python', 'Deep Reinforcement Learning', 'IoT', 'SUMO'],
    role: 'Researcher',
    impact: 'Combined AI and IoT to improve traffic flow in urban intersections.'
  }
];

export const SKILLS: SkillCategory[] = [
  {
    category: 'AI / Machine Learning',
    items: ['Machine Learning', 'Deep Learning', 'Reinforcement Learning', 'Computer Vision', 'Data Science', 'Quantum Computing']
  },
  {
    category: 'Languages',
    items: ['Python', 'C', 'C++', 'Java', 'JavaScript', 'TypeScript', 'Go', 'R', 'SQL', 'PHP']
  },
  {
    category: 'Frameworks',
    items: ['TensorFlow', 'PyTorch', 'Keras', 'ReactJS', 'NextJS', 'Laravel', 'Tailwind']
  },
  {
    category: 'Tools & Cloud',
    items: ['Huawei Cloud', 'AWS', 'Docker', 'Git', 'Power BI', 'SPSS', 'SUMO', 'Lambda']
  }
];

export const EXPERIENCE: ExperienceItem[] = [
  {
    id: 'huawei',
    role: 'Solution Architect',
    company: 'Huawei Cloud Indonesia',
    period: 'Sept 2025 - Present',
    description: 'Analyze customer requirements to properly understand customers’ needs. Propose a Huawei Cloud solution accordingly to their needs and design the solution architecture to be efficient and cost-effective. Participated in a customer migration project from GCP to Huawei Cloud.'
  },
  {
    id: 'binus-mentor',
    role: 'Mentor (Student Advisory)',
    company: 'BINUS University',
    period: 'Sept 2024 - Jan 2025',
    description: 'Guided mentees academically for better performance. Taught course materials resulting in improved test scores.'
  },
  {
    id: 'himti',
    role: 'Academic Events Activist',
    company: 'HIMTI BINUS',
    period: '2023 - 2025',
    description: 'Organized multiple seminars and workshops. Chairman of HILET 2024.'
  },
  {
    id: 'digdaya',
    role: 'Research Intern',
    company: 'Digdaya Duta Digital',
    period: 'Aug 2022 - Jan 2023',
    description: 'Analyzed e-learning platform codebase. Reported on AI/ML potential for business development.'
  },
  {
    id: 'cbn',
    role: 'Research Intern',
    company: 'Cyberindo Aditama',
    period: 'May 2021 - May 2022',
    description: 'Conducted research on student behavior during online learning. Proposed solutions using learning-focused devices.'
  }
];

export const CERTIFICATIONS: Certification[] = [
  { name: 'Huawei Certified ICT Associate - Cloud Service', issuer: 'Huawei', year: '2025' },
  { name: 'Alibaba Cloud Associate (ACA) Cloud Computing', issuer: 'Alibaba Cloud', year: '2024' },
  { name: 'Fundamentals of Deep Learning', issuer: 'NVIDIA', year: '2024' },
  { name: 'IELTS 7.5 Band Score', issuer: 'IELTS', year: '2024' }
];

export const PUBLICATIONS: Publication[] = [
  {
    title: 'Simulation-Based Optimization of Autonomous Vehicles Using Genetic Algorithm',
    authors: 'K. F. Hanson, K. K. Al Biruni, Anderies and A. Chowanda',
    conference: '2024 6th International Conference on Cybernetics and Intelligent System (ICORIS)',
    year: '2024',
    doi: '10.1109/ICORIS63540.2024.10903833'
  }
];