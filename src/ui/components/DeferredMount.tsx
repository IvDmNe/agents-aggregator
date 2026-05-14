import { useEffect, useRef, useState, type ReactNode } from 'react';

interface DeferredMountProps {
  /** Approx final height of the content. Used for a placeholder so layout
   *  doesn't jump when the real subtree mounts. */
  placeholderHeight?: number;
  /** Pixels of viewport margin used to start mounting before fully visible.
   *  Default 600px gives smooth scrolling without obvious pop-in. */
  rootMargin?: string;
  children: ReactNode;
}

/**
 * Renders a height-preserving placeholder until the wrapper is near the
 * viewport, then mounts `children` and never unmounts. Used to keep heavy
 * subtrees (e.g. syntax-highlighted diffs) from all mounting on session
 * switch — only the entries near the viewport pay the mount cost.
 *
 * Uses an IntersectionObserver against the document viewport. That's correct
 * even for content inside an inner overflow:auto scroller, because scrolling
 * within the inner container still moves the children relative to the
 * viewport, which is what IO measures.
 */
export function DeferredMount({
  placeholderHeight = 120, rootMargin = '600px', children,
}: DeferredMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    // If the browser misses IO (older Safari etc.), fall back to mounting.
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin });
    io.observe(node);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;
  return <div ref={ref} style={{ minHeight: placeholderHeight }} aria-hidden />;
}
