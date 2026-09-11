import FlowAI from './FlowAI.astro';
import CuanCerdas from './CuanCerdas.astro';
import AVSim from './AVSim.astro';
import TemuCita from './TemuCita.astro';

// Project slug → animated thumbnail component. Slugs without an entry fall back
// to the static <ProjectImage>.
export const THUMBS: Record<string, (props: { label: string }) => any> = {
  flowai: FlowAI,
  cuancerdas: CuanCerdas,
  'av-simulation': AVSim,
  temucita: TemuCita,
};

export const hasThumb = (slug: string) => slug in THUMBS;
