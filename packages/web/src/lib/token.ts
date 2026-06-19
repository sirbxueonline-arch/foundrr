/**
 * Access token handling. The token arrives via the URL `?token=...` and is
 * persisted to sessionStorage so API/WS calls keep it across SPA navigations.
 *
 * The token is intentionally LEFT in the address-bar URL: the daemon gates
 * `GET /` on the `?token=` query, so a plain refresh or a bookmark with no
 * token in the URL would hit the daemon's "append ?token=" page instead of the
 * app. Keeping the token in the URL is the right call for a personal tool
 * reached by a tokenized link — it makes the page reloadable and bookmarkable
 * on a phone.
 */

const STORAGE_KEY = "mc.token";

let cached: string | null | undefined;

function readFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
  } catch {
    return null;
  }
}

/**
 * Returns the access token, or `null` if none is available.
 * Resolution order: in-memory cache → URL query → sessionStorage.
 * When found in the URL it is persisted to sessionStorage as a fallback, but
 * is deliberately left in the address bar so reload/bookmark keep working.
 */
export function getToken(): string | null {
  if (cached !== undefined) return cached;

  const fromUrl = readFromUrl();
  if (fromUrl) {
    try {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
    } catch {
      // sessionStorage may be unavailable (private mode); keep the in-memory copy.
    }
    cached = fromUrl;
    return cached;
  }

  try {
    cached = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export function hasToken(): boolean {
  return Boolean(getToken());
}
