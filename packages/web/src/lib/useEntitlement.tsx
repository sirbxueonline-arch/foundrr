/**
 * Entitlement context — one shared source of truth for the install's plan, read
 * by the whole dashboard (not just the Settings panel). Components call
 * `useEntitlement()` to gate features by plan; `LicenseSection` calls `refresh()`
 * after activating/removing a key so the rest of the UI updates live, with no
 * reload.
 *
 * Defensive: a failed fetch (older daemon, no route) resolves to `null`, which
 * every consumer treats as "free / unknown" — the dashboard never breaks because
 * licensing is unavailable.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Entitlement } from "@mission-control/shared";

import { getLicense } from "./api";

interface EntitlementValue {
  /** The resolved entitlement, or null until loaded / on error. */
  entitlement: Entitlement | null;
  /** True until the first fetch settles. */
  loading: boolean;
  /** Re-fetch the entitlement (called after the key changes). */
  refresh: () => Promise<void>;
}

const EntitlementContext = createContext<EntitlementValue>({
  entitlement: null,
  loading: true,
  refresh: async () => {},
});

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await getLicense();
      setEntitlement(next);
    } catch {
      // Older daemon / no route / network — treat as unknown, never throw.
      setEntitlement(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <EntitlementContext.Provider value={{ entitlement, loading, refresh }}>
      {children}
    </EntitlementContext.Provider>
  );
}

/** Read the shared entitlement + a `refresh()` to re-pull it. */
export function useEntitlement(): EntitlementValue {
  return useContext(EntitlementContext);
}

/** True when a paid plan is currently active (the gate every Pro feature uses). */
export function isPaid(entitlement: Entitlement | null): boolean {
  return !!entitlement && entitlement.active && entitlement.plan !== "free";
}
