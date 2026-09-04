import { useEffect, useRef, useState } from 'react';
/** At most four full-book display parses per second during streaming; terminal output is immediate. */
export function useThrottledPreview(value: string, active: boolean) {
  const [display, setDisplay] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (!active) { setDisplay(value); return; }
    const timer = setInterval(() => setDisplay(latest.current), 250);
    return () => clearInterval(timer);
  }, [active]);
  return !active || !value ? value : display;
}
