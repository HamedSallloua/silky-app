import { useCallback, useEffect, useRef } from 'react';

export default function InfiniteMarquee({
  children,
  orientation = 'horizontal', // 'horizontal' | 'vertical'
  direction = 'normal', // 'normal' (left/top) or 'reverse'
  speed = 30, // pixels per second matching announcement bar
  stepAmount,
  showArrows = true,
  className = '',
}) {
  const trackRef = useRef(null);
  const sequenceRef = useRef(null);
  const posRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(0);
  const startPosRef = useRef(0);

  const isVertical = orientation === 'vertical';

  const updateTransform = useCallback(() => {
    if (!trackRef.current) return;
    if (isVertical) {
      trackRef.current.style.transform = `translate3d(0, -${posRef.current}px, 0)`;
    } else {
      trackRef.current.style.transform = `translate3d(-${posRef.current}px, 0, 0)`;
    }
  }, [isVertical]);

  useEffect(() => {
    let rafId;
    let lastTime = performance.now();

    const step = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!isDraggingRef.current) {
        const seq = sequenceRef.current;
        const size = seq ? (isVertical ? seq.offsetHeight : seq.offsetWidth) : 0;

        if (size > 0) {
          const moveDir = direction === 'reverse' ? -1 : 1;
          posRef.current += moveDir * speed * dt;

          while (posRef.current >= size) {
            posRef.current -= size;
          }
          while (posRef.current < 0) {
            posRef.current += size;
          }

          updateTransform();
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [speed, isVertical, direction, updateTransform]);

  const handleArrowClick = (dirMultiplier) => {
    const seq = sequenceRef.current;
    const size = seq ? (isVertical ? seq.offsetHeight : seq.offsetWidth) : 0;
    if (!size) return;

    const step = stepAmount || (isVertical ? 120 : 255);
    posRef.current += dirMultiplier * step;

    while (posRef.current >= size) {
      posRef.current -= size;
    }
    while (posRef.current < 0) {
      posRef.current += size;
    }

    updateTransform();
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('.ticker_arrow_btn')) return;
    isDraggingRef.current = true;
    dragStartRef.current = isVertical ? e.clientY : e.clientX;
    startPosRef.current = posRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const current = isVertical ? e.clientY : e.clientX;
    const delta = dragStartRef.current - current;
    const seq = sequenceRef.current;
    const size = seq ? (isVertical ? seq.offsetHeight : seq.offsetWidth) : 0;

    if (size > 0) {
      let newPos = startPosRef.current + delta;
      while (newPos >= size) {
        newPos -= size;
      }
      while (newPos < 0) {
        newPos += size;
      }
      posRef.current = newPos;
      updateTransform();
    }
  };

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  return (
    <div className={`infinite_marquee ${orientation} ${className}`}>
      <div
        className="infinite_marquee_viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div ref={trackRef} className="infinite_marquee_track">
          <div ref={sequenceRef} className={`infinite_marquee_sequence ${orientation}`}>
            {children}
          </div>
          <div className={`infinite_marquee_sequence ${orientation}`} aria-hidden="true">
            {children}
          </div>
        </div>
      </div>

      {showArrows && (
        <>
          <button
            type="button"
            className={`ticker_arrow_btn ticker_arrow_${isVertical ? 'up' : 'left'}`}
            onClick={(e) => {
              e.stopPropagation();
              handleArrowClick(-1);
            }}
            aria-label={isVertical ? 'Défiler vers le haut' : 'Défiler vers la gauche'}
          >
            {isVertical ? '▲' : '❮'}
          </button>
          <button
            type="button"
            className={`ticker_arrow_btn ticker_arrow_${isVertical ? 'down' : 'right'}`}
            onClick={(e) => {
              e.stopPropagation();
              handleArrowClick(1);
            }}
            aria-label={isVertical ? 'Défiler vers le bas' : 'Défiler vers la droite'}
          >
            {isVertical ? '▼' : '❯'}
          </button>
        </>
      )}
    </div>
  );
}

