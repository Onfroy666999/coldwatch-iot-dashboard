import { useState, useCallback, useRef } from 'react';
import { motion, type PanInfo } from 'motion/react';
import { RefreshCw } from 'lucide-react';

const PULL_THRESHOLD = 64; // px of pull needed to trigger a refresh
const MAX_PULL        = 96; // visual cap once resistance kicks in past the threshold

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

// Wraps a page's content in a native-feeling "pull down to refresh" gesture.
// Built on motion's onPan rather than raw touchmove listeners deliberately —
// React 18 attaches touch listeners passively at the root, so
// e.preventDefault() inside a plain onTouchMove handler silently fails and
// the page scrolls out from under the gesture. motion's pan recognizer
// doesn't have that problem and coexists with normal scrolling.
//
// Only engages when the page's scroll container (the shared <main> in
// App.tsx) is already scrolled to the very top — anywhere else on the page,
// this is inert and normal scrolling is completely untouched.
export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const draggingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getScrollParent = () => wrapperRef.current?.closest('main') ?? null;

  const handlePan = useCallback((_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (refreshing) return;
    const scrollParent = getScrollParent();
    // Not at the top, or pulling upward — this is an ordinary scroll, not a
    // pull-to-refresh gesture. Bail out without touching pullDistance state
    // unless we'd previously started tracking a pull (in which case reset it).
    if (!scrollParent || scrollParent.scrollTop > 0 || info.offset.y <= 0) {
      if (draggingRef.current) { draggingRef.current = false; setPullDistance(0); }
      return;
    }
    draggingRef.current = true;
    const raw = info.offset.y;
    const resisted = raw <= PULL_THRESHOLD ? raw : PULL_THRESHOLD + (raw - PULL_THRESHOLD) * 0.3;
    setPullDistance(Math.min(resisted, MAX_PULL));
  }, [refreshing]);

  const handlePanEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // hold the indicator in place while the refresh runs
      onRefresh()
        .catch(() => {
          // Swallow — this component doesn't know how to surface a refresh
          // failure, and letting it reject unhandled would just be a console
          // warning with no user-facing effect either way. Callers that care
          // about surfacing an error should handle it inside their own
          // onRefresh before it reaches here.
        })
        .finally(() => {
          setRefreshing(false);
          setPullDistance(0);
        });
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, onRefresh]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);

  return (
    <motion.div ref={wrapperRef} onPan={handlePan} onPanEnd={handlePanEnd}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height: pullDistance, transition: draggingRef.current ? 'none' : 'height 200ms ease-out' }}
        aria-hidden="true"
      >
        <RefreshCw
          className={refreshing ? 'w-5 h-5 animate-spin' : 'w-5 h-5'}
          style={{
            color: '#0984E3',
            opacity: progress,
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
          }}
        />
      </div>
      {children}
    </motion.div>
  );
}
