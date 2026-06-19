/**
 * useNow — a once-per-second "now" clock (epoch ms) for keeping relative-time
 * and uptime labels fresh. Optionally corrected by the daemon's serverTime so
 * timestamps stay accurate under client/daemon clock skew. The interval is
 * cleaned up on unmount.
 */
import { useEffect, useState } from "react";

const TICK_MS = 1000;

export function useNow(serverTime: number | null): number {
  // Skew = daemon clock − local clock at the moment we received serverTime.
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (serverTime != null) {
      setSkew(serverTime - Date.now());
    }
  }, [serverTime]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now + skew;
}
