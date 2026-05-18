export interface Project {
  id: number;
  title: string;
  category: string;
  year: string;
  image: string;
  description?: string;
  fullDescription?: string[];
  techStack?: string[];
  role?: string;
  link?: string;
  github?: string;
  featured?: boolean;
  hidden?: boolean;
}

export interface MousePosition {
  x: number;
  y: number;
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
  doi: string;
}

export interface Certification {
  name: string;
  issuer: string;
  year: string;
}
