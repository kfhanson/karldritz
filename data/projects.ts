import { Project } from '../types';

const flow = new URL('../images/stage2.jpeg', import.meta.url).href;
const traffic = new URL('../images/taiwan.jpeg', import.meta.url).href;
const av = new URL('../images/autove.jpeg', import.meta.url).href;
const aws = new URL('../images/awsllm.png', import.meta.url).href;
const porto = new URL('../images/portofolio.png', import.meta.url).href;
const mag = new URL('../images/magnifier.png', import.meta.url).href;

export const projects: Project[] = [
  { 
    id: 1, 
    title: "FlowAI", 
    category: "IoT / Reinforcement Learning", 
    year: "2025", 
    image: flow,
    role: "Project Manager & Lead Developer",
    description: "Huawei Developer Competition 2025 APAC Grand Finalist.",
    fullDescription: [
      "Project made for the Huawei Developer Competition 2025 APAC, reaching the final pitching event in Hong Kong as a grand finalist project.",
      "FlowAI implements Multi-Agent Reinforcement Learning (MARL) to achieve complete traffic control of entire city corridors. By utilizing Edge Computing devices (IoT) and Cloud infrastructure, it optimizes traffic flow in real-time.",
      "Simulations are run in SUMO (Simulation of Urban MObility) and models are trained on Huawei Cloud, demonstrating significant improvements in traffic congestion metrics."
    ],
    techStack: ["Python", "Huawei Cloud", "SUMO", "Reinforcement Learning", "MARL", "IoT"],
  },
  { 
    id: 2, 
    title: "Intelligent Traffic", 
    category: "IoT / Deep Reinforcement Learning", 
    year: "2025", 
    image: traffic,
    role: "Researcher",
    description: "Smart traffic control using Edge Computing and SUMO.",
    fullDescription: [
      "A research project focusing on the implementation of AIoT technologies, combining Artificial Intelligence and Internet of Things, to improve traffic flow in complex urban intersections.",
      "The system employs a Traffic Light agent implementing edge computing devices. It uses an offline deep reinforcement learning framework for agent training within SUMO simulations.",
      "This approach allows for adaptive signal control that responds to real-time traffic conditions rather than static timers."
    ],
    techStack: ["Python", "Deep Reinforcement Learning", "IoT", "SUMO", "Edge Computing"]
  },
  { 
    id: 3, 
    title: "AV Simulation", 
    category: "AI / Neural Networks", 
    year: "2024", 
    image: av,
    role: "AI Engineer",
    description: "Training vehicles through generations with NEAT algorithm.",
    fullDescription: [
      "Autonomous Vehicle Training Simulation using Genetic Algorithms. This research-purposed program trains vehicles through successive generations using the NEAT (NeuroEvolution of Augmenting Topologies) algorithm.",
      "The project utilizes PyGame's interface to visualize the training process. It focuses on demonstrating how simulations can be effectively used to train autonomous driving models.",
      "Further development included hyperparameter tuning to achieve optimal pathfinding and collision avoidance results."
    ],
    techStack: ["Python", "NEAT", "PyGame", "Genetic Algorithms", "Neural Networks"]
  },
  { 
    id: 4, 
    title: "AWS Agent", 
    category: "Cloud Computing / LLM", 
    year: "2024", 
    image: aws,
    role: "Cloud Architect",
    description: "Serverless AI assistant using AWS Lambda and SageMaker.",
    fullDescription: [
      "A Serverless AI assistant architected using AWS Lambda to query a Large Language Model (LLM) hosted on Amazon SageMaker.",
      "The assistant is designed to answer general video game questions and can optionally provide real-time pricing information by fetching structured data from an S3 bucket.",
      "This project demonstrates a cost-effective, scalable serverless architecture for deploying LLM-based applications."
    ],
    techStack: ["Python", "AWS Lambda", "Amazon SageMaker", "S3", "LLM", "Cloud Computing"],
    github: "https://github.com/kfhanson/AWS-LLM-Connector"
  },
  { 
    id: 5, 
    title: "Karldritz's Portofolio", 
    category: "Web Dev / Interactive", 
    year: "2025", 
    image: porto,
    role: "Frontend Developer",
    description: "Interactive web application portfolio.",
    fullDescription: [
      "A unique web application designed to showcase my portfolio",
      "Includes user interaction with minimalist aesthetic while demonstrating technical proficiency.",
      "Built as a personal project to enhance web development skills in React and TypeScript ecosystem."
    ],
    techStack: ["React", "TypeScript", "NextJS", "Tailwind CSS", "GSAP"],
    link: "https://kfhanson.github.io/karldritz/"
  },
  { 
    id: 6, 
    title: "Image Magnifier", 
    category: "Web Tool", 
    year: "2024", 
    image: mag,
    role: "Frontend Developer",
    description: "Web-based tool for magnifying images.",
    fullDescription: [
      "A web-based utility tool for magnifying images with an easy-to-use interface.",
      "Developed as a side project to learn advanced image manipulation techniques on the web while strengthening core web development skills."
    ],
    techStack: ["React", "TypeScript", "NextJS", "Canvas API"],
    link: "https://kfhanson.github.io/image-magnifier/",
    github: "https://github.com/kfhanson/image-magnifier"
  },
];