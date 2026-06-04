import type { ImageMetadata } from 'astro';

import flow from '../images/stage2.jpeg';
import traffic from '../images/taiwan.jpeg';
import av from '../images/autove.jpeg';
import aws from '../images/awsllm.png';
import cuancerdas from '../images/cuancerdas.jpeg';
import porto from '../images/portofolio.jpeg';
import mag from '../images/magnifier.jpeg';

export interface Project {
  slug: string;
  title: string;
  category: string;
  year: string;
  image: ImageMetadata;
  description?: string;
  fullDescription?: string[];
  techStack?: string[];
  role?: string;
  link?: string;
  github?: string;
  featured?: boolean;
  hidden?: boolean;
}

export const projects: Project[] = [
  {
    slug: 'flowai',
    title: 'FlowAI',
    category: 'Reinforcement Learning / IoT',
    year: '2025',
    image: flow,
    featured: true,
    role: 'Lead AI Engineer',
    description: 'Multi-agent RL for city-wide traffic control. Huawei Developer Competition 2025 APAC Grand Finalist.',
    fullDescription: [
      'FlowAI was built for the Huawei Developer Competition 2025 APAC, reaching the final pitching event in Hong Kong as a Grand Finalist project.',
      'The system implements Multi-Agent Reinforcement Learning (MARL) to achieve complete traffic control across city-wide corridors. Edge Computing devices (IoT) and Huawei Cloud infrastructure work together to optimize traffic flow in real time.',
      'Simulations are run in SUMO (Simulation of Urban Mobility); models are trained on Huawei Cloud. The MARL approach demonstrated significant improvements over both fixed-cycle and single-agent baselines in congestion reduction metrics.',
    ],
    techStack: ['Python', 'Huawei Cloud', 'SUMO', 'Reinforcement Learning', 'MARL', 'IoT'],
  },
  {
    slug: 'aws-agent',
    title: 'AWS Agent',
    category: 'Agentic LLM / Cloud',
    year: '2024',
    image: aws,
    featured: false,
    role: 'Cloud Architect',
    description: 'Agentic LLM on serverless: Lambda + SageMaker + S3.',
    fullDescription: [
      'A serverless AI assistant architected on AWS Lambda to query a Large Language Model (LLM) hosted on Amazon SageMaker.',
      'The agent answers general queries and fetches real-time structured data from an S3 bucket — demonstrating agentic tool use within a cost-effective, fully serverless stack.',
      'This project shows that LLM-based agents can be deployed without persistent infrastructure, scaling to zero when idle and eliminating server management overhead.',
    ],
    techStack: ['Python', 'AWS Lambda', 'Amazon SageMaker', 'S3', 'LLM', 'Cloud Computing'],
    github: 'https://github.com/kfhanson/AWS-LLM-Connector',
  },
  {
    slug: 'cuancerdas',
    title: 'CuanCerdas',
    category: 'Agentic LLM / FinTech',
    year: '2026',
    image: cuancerdas,
    featured: true,
    role: 'Team Lead, Full Stack',
    description: 'Dual AI agent for financial literacy & reporting. Alibaba Hackathon 2nd place.',
    fullDescription: [
      'CuanCerdas was built for the Paylabs Alibaba Cloud Mini Hackathon 2026, finishing 2nd place at the pitching event. A fintech platform designed to improve financial literacy for SME owners through an intelligent dual-agent system.',
      'The system comprises two specialized LLM agents: a report-generation agent that analyzes business data and produces actionable financial reports, and an interactive chatbot advisor that provides personalized financial guidance in natural conversation.',
      'Built on Alibaba Cloud infrastructure with a full-stack implementation combining backend processing with a responsive frontend, demonstrating how multi-agent LLM systems can solve real-world business problems.',
    ],
    techStack: ['LLM', 'Alibaba Cloud', 'AI Agent', 'FinTech', 'Full Stack Development'],
  },
  {
    slug: 'intelligent-traffic',
    title: 'Intelligent Traffic',
    category: 'Deep Reinforcement Learning / IoT',
    year: '2025',
    image: traffic,
    featured: false,
    role: 'Researcher',
    description: 'DRL + edge computing for adaptive signal control in SUMO.',
    fullDescription: [
      'A research project implementing AIoT — the combination of AI and Internet of Things — for adaptive traffic signal control in complex urban intersections.',
      'The system uses a Traffic Light agent running on edge computing devices, trained offline with a deep reinforcement learning framework within SUMO simulations.',
      'This edge-first design means the agent runs locally on intersection hardware without requiring a cloud round-trip, reducing latency and improving reliability under degraded connectivity.',
    ],
    techStack: ['Python', 'Deep Reinforcement Learning', 'IoT', 'SUMO', 'Edge Computing'],
    github: 'https://github.com/kfhanson/Reinforcement-Learning-for-Intelligent-Traffic-Signal-Control',
  },
  {
    slug: 'av-simulation',
    title: 'AV Simulation',
    category: 'Neural Evolution / AI',
    year: '2024',
    image: av,
    featured: true,
    role: 'AI Engineer',
    description: 'Training vehicles through generations with NEAT algorithm.',
    fullDescription: [
      'Autonomous Vehicle Training Simulation using the NEAT (NeuroEvolution of Augmenting Topologies) algorithm and Genetic Algorithms within a PyGame interface.',
      'The program trains vehicles across successive generations, evolving both network topology and weights simultaneously for optimal pathfinding and collision avoidance.',
      'Hyperparameter tuning studies were conducted to analyze convergence behaviour. The work led to a conference publication at ICORIS 2024.',
    ],
    techStack: ['Python', 'NEAT', 'PyGame', 'Genetic Algorithms', 'Neural Networks'],
  },
  {
    slug: 'image-magnifier',
    title: 'Image Magnifier',
    category: 'Web Tool',
    year: '2024',
    image: mag,
    hidden: true,
    role: 'Frontend Developer',
    description: 'Web-based utility for magnifying images.',
    fullDescription: [
      'A web-based utility for magnifying images with a clean, minimal interface.',
      'Built as a focused side project to explore advanced image manipulation via the Canvas API while practising React and TypeScript.',
    ],
    techStack: ['React', 'TypeScript', 'Canvas API'],
    link: 'https://kfhanson.github.io/image-magnifier/',
    github: 'https://github.com/kfhanson/image-magnifier',
  },
  {
    slug: 'portfolio',
    title: "Karldritz's Portfolio",
    category: 'Web Dev',
    year: '2025',
    image: porto,
    hidden: true,
    role: 'Frontend Developer',
    description: 'This site — minimal, editorial, AI-forward.',
    fullDescription: [
      'A minimal, editorial portfolio built with Astro, TypeScript, Tailwind CSS, and Lenis smooth scroll.',
    ],
    techStack: ['Astro', 'TypeScript', 'Tailwind CSS', 'Lenis'],
    link: 'https://kfhanson.github.io/karldritz/',
  },
];

export const visibleProjects = projects.filter(p => !p.hidden);
