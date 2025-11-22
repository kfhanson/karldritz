import React, { ReactNode } from 'react';

interface SectionProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({ id, children, className = "" }) => {
  return (
    <section id={id} className={`py-20 px-6 md:px-12 lg:px-24 w-full max-w-7xl mx-auto ${className}`}>
      {children}
    </section>
  );
};