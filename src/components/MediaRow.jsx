import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from './MediaCard';

function RowSkeleton({ count = 8 }) {
  return (
    <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: 130, flexShrink: 0, aspectRatio: '2/3', borderRadius: 10 }} />
      ))}
    </div>
  );
}

export default function MediaRow({ items = [], loading = false }) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [hovered, setHovered] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();
    return () => el.removeEventListener('scroll', updateArrows);
  }, [items, updateArrows]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 500, behavior: 'smooth' });
  };

  if (loading) return <RowSkeleton />;

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {canLeft && hovered && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => scroll(-1)}
          aria-label="Scroll left"
          style={{
            position: 'absolute', left: -16, top: '38%', transform: 'translateY(-50%)',
            zIndex: 10, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(99,102,241,0.9)',
            border: '1px solid rgba(99,102,241,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <ChevronLeft size={18} />
        </motion.button>
      )}
      {canRight && hovered && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          onClick={() => scroll(1)}
          aria-label="Scroll right"
          style={{
            position: 'absolute', right: -16, top: '38%', transform: 'translateY(-50%)',
            zIndex: 10, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(99,102,241,0.9)',
            border: '1px solid rgba(99,102,241,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <ChevronRight size={18} />
        </motion.button>
      )}
      <div
        ref={scrollRef}
        className="hide-scrollbar"
        style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}
      >
        {items.map((item, i) => (
          <div key={`${item.id}-${i}`} style={{ width: 130, flexShrink: 0 }}>
            <MediaCard item={item} index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}
