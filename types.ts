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
}

export interface MousePosition {
  x: number;
  y: number;
}