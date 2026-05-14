import { useEffect, useState } from 'react';

export type Breakpoint = 'sm' | 'md' | 'lg';

const MD_MIN = 720;
const LG_MIN = 1100;

function compute(width: number): Breakpoint {
  if (width >= LG_MIN) return 'lg';
  if (width >= MD_MIN) return 'md';
  return 'sm';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'lg' : compute(window.innerWidth),
  );

  useEffect(() => {
    const mqMd = window.matchMedia(`(min-width: ${MD_MIN}px)`);
    const mqLg = window.matchMedia(`(min-width: ${LG_MIN}px)`);
    const update = () => setBp(compute(window.innerWidth));
    mqMd.addEventListener('change', update);
    mqLg.addEventListener('change', update);
    update();
    return () => {
      mqMd.removeEventListener('change', update);
      mqLg.removeEventListener('change', update);
    };
  }, []);

  return bp;
}
