"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContainerCard } from "@/components/container-card";
import type { Container } from "@/lib/types";

interface ContainerCarouselEntry {
  container: Container;
  itemCount: number;
  breadcrumbLabel: string;
  status: { label: string; dotClassName: string } | null;
}

const MIN_SCALE = 0.9;
const MAX_SCALE = 1.08;

/**
 * Horizontal snap carousel where the card nearest the viewport center scales
 * up and the rest ease back down — driven by scroll position, not a fixed
 * "active index", so it feels continuous rather than stepped.
 */
export function ContainerCarousel({ entries }: { entries: ContainerCarouselEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [scales, setScales] = useState<number[]>(() => entries.map(() => MIN_SCALE));

  const updateScales = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    const next = itemRefs.current.map((el) => {
      if (!el) return MIN_SCALE;
      const rect = el.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      const distance = Math.abs(containerCenter - itemCenter);
      const maxDistance = containerRect.width / 2 + rect.width / 2;
      const proximity = Math.max(0, 1 - distance / maxDistance); // 1 = dead center, 0 = off-screen
      return MIN_SCALE + proximity * (MAX_SCALE - MIN_SCALE);
    });
    setScales(next);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateScales);
    };
    updateScales();
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [entries.length, updateScales]);

  return (
    <div
      ref={containerRef}
      className="scrollbar-hide -mx-5 -mb-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 px-5 pt-2 pb-8 md:mx-0 md:mb-0 md:scroll-pl-0 md:px-0"
    >
      {entries.map((entry, i) => (
        <div
          key={entry.container.id}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          className="shrink-0 snap-start"
          style={{ transform: `scale(${scales[i] ?? MIN_SCALE})`, transition: "transform 150ms ease-out" }}
        >
          <ContainerCard
            container={entry.container}
            itemCount={entry.itemCount}
            breadcrumbLabel={entry.breadcrumbLabel}
            status={entry.status}
            className="w-42"
          />
        </div>
      ))}
    </div>
  );
}
