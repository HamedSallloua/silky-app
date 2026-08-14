import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const SLIDE_COUNT = 5;
const AUTO_DELAY = 4500;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 450;
const TRANSITION = 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.65s cubic-bezier(0.4, 0, 0.2, 1), filter 0.65s cubic-bezier(0.4, 0, 0.2, 1)';

function normalizeOffset(index, activeIndex, length) {
  let offset = index - activeIndex;
  const half = Math.floor(length / 2);
  while (offset > half) offset -= length;
  while (offset < -half) offset += length;
  return offset;
}

function getSpacing(viewportWidth) {
  return Math.max(130, Math.min(260, viewportWidth * 0.19));
}

function getCardStyle(offset, spacing, dragPx = 0) {
  const abs = Math.abs(offset);
  const scale = abs === 0 ? 1 : abs === 1 ? 0.82 : 0.68;
  const opacity = abs === 0 ? 1 : abs === 1 ? 0.82 : 0.58;
  const zIndex = abs === 0 ? 30 : 20 - abs;
  const translateX = offset * spacing + dragPx;

  return {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    transform: `translate(calc(-50% + ${translateX}px), -50%) scale(${scale})`,
    opacity,
    zIndex,
    filter: abs === 0 ? 'brightness(1.05)' : 'brightness(0.88)',
  };
}

export default function ProductCarousel({ products }) {
  const visibleList = (products || []).filter((p) => !p.isHidden);
  const slides = visibleList.slice(0, SLIDE_COUNT);
  const [activeIndex, setActiveIndex] = useState(0);
  const [spacing, setSpacing] = useState(() => getSpacing(typeof window !== 'undefined' ? window.innerWidth : 1100));
  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [paused, setPaused] = useState(false);

  const containerRef = useRef(null);
  const dragRef = useRef({ active: false, dragging: false, startX: 0, moved: false, pointerId: null });
  const justDraggedRef = useRef(false);
  const wheelLock = useRef(false);

  const DRAG_START_THRESHOLD = 10;

  const goTo = useCallback(
    (index) => {
      if (!slides.length) return;
      setActiveIndex(((index % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  const next = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const prev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => setSpacing(getSpacing(el.clientWidth));
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!slides.length || paused) return;

    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % slides.length);
    }, AUTO_DELAY);

    return () => clearInterval(timer);
  }, [slides.length, paused]);

  const handlePointerDown = (e) => {
    if (e.button !== 0 || e.target.closest('.carousel_arrow')) return;
    dragRef.current = {
      active: true,
      dragging: false,
      startX: e.clientX,
      moved: false,
      pointerId: e.pointerId,
    };
    setPaused(true);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    if (!dragRef.current.dragging) {
      if (Math.abs(dx) < DRAG_START_THRESHOLD) return;
      dragRef.current.dragging = true;
      dragRef.current.moved = true;
      setIsDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
    }

    setDragPx(dx);
  };

  const finishDrag = (e) => {
    if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    const wasDragging = dragRef.current.dragging;

    if (wasDragging) {
      containerRef.current?.releasePointerCapture(e.pointerId);
      justDraggedRef.current = true;

      const threshold = Math.max(40, spacing * 0.25);
      if (dx < -threshold) next();
      else if (dx > threshold) prev();
    }

    dragRef.current = { active: false, dragging: false, startX: 0, moved: false, pointerId: null };
    setIsDragging(false);
    setDragPx(0);
    window.setTimeout(() => setPaused(false), AUTO_DELAY);
  };

  const handleClickCapture = (e) => {
    if (!justDraggedRef.current) return;
    if (e.target.closest('a.coverflow_card_link')) {
      e.preventDefault();
      e.stopPropagation();
    }
    justDraggedRef.current = false;
  };

  const handleArrowClick = (direction) => {
    setPaused(true);
    if (direction === 'next') next();
    else prev();
    window.setTimeout(() => setPaused(false), AUTO_DELAY);
  };

  const handleWheel = (e) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.6) return;
    e.preventDefault();
    if (wheelLock.current) return;

    wheelLock.current = true;
    setPaused(true);
    if (e.deltaX > 0) next();
    else if (e.deltaX < 0) prev();

    window.setTimeout(() => {
      wheelLock.current = false;
      setPaused(false);
    }, 700);
  };

  if (!slides.length) return null;

  const trackShift = dragPx * 0.15;

  return (
    <section
      className="product_carousel_section coverflow_carousel"
      aria-label="Produits en vedette"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <div
        ref={containerRef}
        className="coverflow_viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onWheel={handleWheel}
        onClickCapture={handleClickCapture}
      >
        <div
          className="coverflow_stage"
          style={{
            transform: `translateX(${trackShift}px)`,
            transition: isDragging ? 'none' : 'transform 0.65s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {slides.map((product, index) => {
            const offset = normalizeOffset(index, activeIndex, slides.length);
            const isCenter = offset === 0;

            return (
              <div
                key={product.id}
                className={`coverflow_card${isCenter ? ' coverflow_card_active' : ''}`}
                style={{
                  ...getCardStyle(offset, spacing, dragPx),
                  transition: isDragging ? 'none' : TRANSITION,
                }}
              >
                <Link to={`/product/${product.id}`} className="coverflow_card_link" draggable={false}>
                  <img
                    src={product.collectionImage || product.mainImage}
                    alt={product.name}
                    className="coverflow_card_img"
                    draggable={false}
                  />
                  <div className="coverflow_card_overlay">
                    <h3 className="coverflow_card_title">{product.name}</h3>
                    {isCenter && <span className="coverflow_card_cta">Découvrir</span>}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>

        <button type="button" className="carousel_arrow carousel_arrow_left" onClick={() => handleArrowClick('prev')} aria-label="Précédent">
          &#8249;
        </button>
        <button type="button" className="carousel_arrow carousel_arrow_right" onClick={() => handleArrowClick('next')} aria-label="Suivant">
          &#8250;
        </button>
      </div>
    </section>
  );
}
