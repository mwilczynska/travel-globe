import { useCallback, useEffect, useRef, useState } from 'react';

export interface SortableMedia {
  filePath: string;
  fileType: string;
  originalFilename?: string;
  latitude?: number;
  longitude?: number;
}

interface SortableMediaGridProps<T extends SortableMedia> {
  items: T[];
  onReorder: (items: T[]) => void;
  onRemove: (index: number) => void;
}

// Pixels the pointer must travel before a press turns into a drag, so that
// taps on the remove button still register as clicks.
const DRAG_THRESHOLD = 5;

interface SlotRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Grid of uploaded media that can be reordered by dragging a tile anywhere in
 * the grid. The tile lifts out as a floating card and the remaining tiles
 * close up around it, so a photo can be moved several slots in one gesture.
 * Works with mouse, pen and touch via pointer events.
 */
export function SortableMediaGrid<T extends SortableMedia>({
  items,
  onReorder,
  onRemove,
}: SortableMediaGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slotRects = useRef<SlotRect[]>([]);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const grabOffset = useRef({ x: 0, y: 0 });
  const pendingIndex = useRef<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const itemsRef = useRef(items);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ left: number; top: number; w: number; h: number } | null>(null);

  // Keep a ref in sync so the window-level pointer handlers never reorder a
  // stale copy of the list.
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const endDrag = useCallback(() => {
    pointerStart.current = null;
    pendingIndex.current = null;
    dragIndexRef.current = null;
    slotRects.current = [];
    setDragIndex(null);
    setGhost(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, index: number) => {
    // Let the remove button handle its own clicks.
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    if (e.button !== undefined && e.button !== 0) return;

    const container = containerRef.current;
    if (!container) return;

    const tileRect = e.currentTarget.getBoundingClientRect();

    pointerStart.current = { x: e.clientX, y: e.clientY };
    pendingIndex.current = index;
    grabOffset.current = {
      x: e.clientX - tileRect.left,
      y: e.clientY - tileRect.top,
    };
  }, []);

  // Window-level move/up handling: the dragged tile is re-rendered as a floating
  // card mid-gesture, so listening on the tile itself would drop the pointer.
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const start = pointerStart.current;
      const container = containerRef.current;
      if (!start || !container || pendingIndex.current === null) return;

      // Promote the press to a drag once it clears the threshold.
      if (dragIndexRef.current === null) {
        const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        if (dist < DRAG_THRESHOLD) return;

        const cRect = container.getBoundingClientRect();
        const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-slot]'));
        slotRects.current = slots.map(el => {
          const r = el.getBoundingClientRect();
          return {
            cx: r.left - cRect.left + r.width / 2,
            cy: r.top - cRect.top + r.height / 2,
            w: r.width,
            h: r.height,
          };
        });
        dragIndexRef.current = pendingIndex.current;
        setDragIndex(pendingIndex.current);
      }

      e.preventDefault();

      // Recompute the container rect every move: the page can scroll mid-drag.
      const cRect = container.getBoundingClientRect();
      const px = e.clientX - cRect.left;
      const py = e.clientY - cRect.top;

      const current = dragIndexRef.current;
      const slot = slotRects.current[current] ?? slotRects.current[0];
      if (slot) {
        setGhost({
          left: px - grabOffset.current.x,
          top: py - grabOffset.current.y,
          w: slot.w,
          h: slot.h,
        });
      }

      // Drop into whichever slot the pointer is closest to. Slot geometry is
      // fixed (every tile is the same size), so the rects measured at drag start
      // stay valid as the list reorders underneath.
      let best = current;
      let bestDist = Infinity;
      slotRects.current.forEach((s, i) => {
        const d = (s.cx - px) ** 2 + (s.cy - py) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });

      if (best !== current) {
        onReorder(moveItem(itemsRef.current, current, best));
        dragIndexRef.current = best;
        setDragIndex(best);
      }
    };

    const handleUp = () => {
      if (pointerStart.current) endDrag();
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [onReorder, endDrag]);

  // Keyboard equivalent, so reordering is still possible without a pointer.
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let target: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = index - 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = index + 1;
    if (target === null || target < 0 || target >= items.length) return;
    e.preventDefault();
    onReorder(moveItem(items, index, target));
  };

  const renderThumb = (m: T, className: string, iconSize: string) =>
    m.fileType.startsWith('video/') ? (
      <>
        <video src={`/uploads/${m.filePath}`} preload="metadata" className={`${className} bg-black`} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg className={`${iconSize} text-white/80 drop-shadow-lg`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </>
    ) : (
      <img src={`/uploads/${m.filePath}`} alt={m.originalFilename || ''} className={className} draggable={false} />
    );

  if (items.length === 0) return null;

  return (
    <div>
      <div
        ref={containerRef}
        className={`relative grid grid-cols-3 gap-3 ${dragIndex !== null ? 'select-none' : ''}`}
        data-testid="sortable-media-grid"
      >
        {items.map((m, index) => (
          <div
            key={`${m.filePath}-${index}`}
            data-slot
            data-media-index={index}
            tabIndex={0}
            role="button"
            aria-label={`Media ${index + 1} of ${items.length}. Drag to reorder, or use arrow keys.`}
            title="Drag to reorder"
            onPointerDown={e => handlePointerDown(e, index)}
            onKeyDown={e => handleKeyDown(e, index)}
            className="relative group rounded-lg cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <div className={`relative ${dragIndex === index ? 'invisible' : ''}`}>
              {renderThumb(m, 'w-full h-24 object-cover rounded-lg pointer-events-none', 'w-8 h-8')}

              {/* Order badge */}
              <div className="absolute top-1 left-1 min-w-[1.25rem] h-5 px-1 bg-black/60 text-white text-xs rounded flex items-center justify-center pointer-events-none">
                {index + 1}
              </div>

              <button
                type="button"
                data-no-drag
                aria-label={`Remove media ${index + 1}`}
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center text-sm"
              >
                &times;
              </button>

              {m.latitude != null && m.longitude != null && (
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/50 text-white text-xs rounded pointer-events-none">
                  GPS
                </div>
              )}
            </div>

            {/* Outline marking the gap the dragged card lifted out of */}
            {dragIndex === index && (
              <div className="absolute inset-0 rounded-lg border-2 border-dashed border-sky-400 bg-sky-50" />
            )}
          </div>
        ))}

        {/* Floating card that follows the pointer */}
        {dragIndex !== null && ghost && (
          <div
            className="absolute z-50 pointer-events-none rounded-lg shadow-2xl ring-2 ring-sky-500 overflow-hidden"
            style={{
              left: ghost.left,
              top: ghost.top,
              width: ghost.w,
              height: ghost.h,
              transform: 'scale(1.06) rotate(-2deg)',
            }}
          >
            {renderThumb(items[dragIndex], 'w-full h-full object-cover', 'w-8 h-8')}
          </div>
        )}
      </div>

      {items.length > 1 && (
        <p className="mt-2 text-xs text-gray-500">Drag a photo anywhere in the grid to reorder.</p>
      )}
    </div>
  );
}
