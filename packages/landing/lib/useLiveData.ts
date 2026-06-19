"use client";

import { useEffect, useRef, useState } from "react";
import { CLIENT_POLL_MS } from "./config";
import {
  fetchGlobalTotals,
  fetchLeaderboard,
  type GlobalTotals,
  type LeaderboardRow,
} from "./supabase";

export interface LiveData {
  totals: GlobalTotals;
  leaderboard: LeaderboardRow[];
}

// Polls Supabase on the client so counters feel live. Seeds from
// server-rendered data to avoid a flash of zeros on first paint.
export function useLiveData(initial: LiveData): LiveData {
  const [data, setData] = useState<LiveData>(initial);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function poll(): Promise<void> {
      try {
        const [totals, leaderboard] = await Promise.all([
          fetchGlobalTotals({ signal: controller.signal }),
          fetchLeaderboard({ signal: controller.signal }),
        ]);
        if (!mountedRef.current) return;
        // Never overwrite real data with an empty fetch hiccup.
        setData((prev) => ({
          totals: totals.events > 0 || prev.totals.events === 0 ? totals : prev.totals,
          leaderboard: leaderboard.length > 0 ? leaderboard : prev.leaderboard,
        }));
      } catch {
        // Keep last good data on transient failures.
      }
    }

    const id = setInterval(poll, CLIENT_POLL_MS);
    return () => {
      mountedRef.current = false;
      controller.abort();
      clearInterval(id);
    };
  }, []);

  return data;
}
