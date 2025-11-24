export enum SectionId {
  Hero = 'hero',
  About = 'about',
  Projects = 'projects',
  Skills = 'skills',
  Experience = 'experience',
  Game = 'game',
  Contact = 'contact'
}

export interface Project {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  role: string;
  /** Optional image URL or imported asset for the project card */
  image?: string;
  impact: string;
  githubUrl?: string;
  demoUrl?: string;
  ethicalConsiderations?: string;
}

export interface ExperienceItem {
  id: string;
  role: string;
  company: string;
  period: string;
  description: string;
}

export interface SkillCategory {
  category: string;
  items: string[];
}

export interface Publication {
  title: string;
  authors: string;
  conference: string;
  year: string;
  doi?: string;
}

export interface Certification {
  name: string;
  issuer: string;
  year: string;
}