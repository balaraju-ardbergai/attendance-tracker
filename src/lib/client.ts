type CacheEntry = {
  expiresAt: number;
  recheckAt?: number;
  value?: unknown;
  promise?: Promise<unknown>;
};

const cache = new Map<string, CacheEntry>();

type CacheRule = {
  path: string;
  ttlMs: number;
  recheckMs?: number;
};

const CACHE_RULES: CacheRule[] = [
  { path: "/api/directory", ttlMs: 10 * 60_000, recheckMs: 5 * 60_000 },
  { path: "/api/theme", ttlMs: 60 * 60_000 },
];

class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function cacheRule(url: string, init?: RequestInit) {
  const method = init?.method?.toUpperCase() ?? "GET";
  if (method !== "GET") return null;
  const path = url.split("?")[0];
  return CACHE_RULES.find((rule) => rule.path === path) ?? null;
}

function cacheKey(url: string) {
  return url;
}

export function clearApiCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function invalidateAfterMutation(url: string) {
  const path = url.split("?")[0];
  if (path.startsWith("/api/users")) clearApiCache("/api/directory");
  if (path.startsWith("/api/approvals")) clearApiCache("/api/directory");
  if (path === "/api/theme") clearApiCache("/api/theme");
  if (path.startsWith("/api/auth/logout")) clearApiCache();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(res.status, (data as { error?: string }).error ?? "Something went wrong.");
  }
  return data as T;
}

function shouldClearCache(err: unknown) {
  return err instanceof ApiClientError && (err.status === 401 || err.status === 403);
}

function backgroundRecheck<T>(url: string, key: string, rule: NonNullable<ReturnType<typeof cacheRule>>) {
  const request = fetchJson<T>(url);
  const now = Date.now();
  const previous = cache.get(key);
  cache.set(key, {
    value: previous?.value,
    expiresAt: previous?.expiresAt ?? now + rule.ttlMs,
    recheckAt: now + (rule.recheckMs ?? rule.ttlMs),
    promise: request,
  });
  request
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + rule.ttlMs,
        recheckAt: rule.recheckMs ? Date.now() + rule.recheckMs : undefined,
      });
    })
    .catch((err) => {
      if (shouldClearCache(err)) clearApiCache();
      else if (previous) cache.set(key, { ...previous, recheckAt: Date.now() + 60_000 });
      else cache.delete(key);
    });
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const rule = cacheRule(url, init);
  const key = rule ? cacheKey(url) : "";
  const now = Date.now();
  if (rule) {
    const cached = cache.get(key);
    if (cached?.value !== undefined && cached.expiresAt > now) {
      if (rule.recheckMs && (!cached.recheckAt || cached.recheckAt <= now) && !cached.promise) {
        backgroundRecheck<T>(url, key, rule);
      }
      return cached.value as T;
    }
    if (cached?.promise) return cached.promise as Promise<T>;
  }

  const request = fetchJson<T>(url, init).then((data) => {
    if (!rule) invalidateAfterMutation(url);
    return data;
  });

  if (rule) {
    cache.set(key, {
      expiresAt: now + rule.ttlMs,
      recheckAt: rule.recheckMs ? now + rule.recheckMs : undefined,
      promise: request,
    });
    try {
      const value = await request;
      cache.set(key, {
        expiresAt: Date.now() + rule.ttlMs,
        recheckAt: rule.recheckMs ? Date.now() + rule.recheckMs : undefined,
        value,
      });
      return value;
    } catch (err) {
      if (shouldClearCache(err)) clearApiCache();
      cache.delete(key);
      throw err;
    }
  }

  return request;
}

export async function refreshApi<T>(url: string): Promise<T> {
  const rule = cacheRule(url);
  const value = await fetchJson<T>(url);
  if (rule) {
    cache.set(cacheKey(url), {
      expiresAt: Date.now() + rule.ttlMs,
      recheckAt: rule.recheckMs ? Date.now() + rule.recheckMs : undefined,
      value,
    });
  }
  return value;
}

export function prefetchApi(url: string) {
  const run = () => {
    void api(url).catch(() => {});
  };
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    globalThis.setTimeout(run, 500);
  }
}

export async function uncachedApi<T>(url: string, init?: RequestInit): Promise<T> {
  return fetchJson<T>(url, init);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** "2026-10-26" or ISO date string -> local weekday number via UTC (0=Sun..6=Sat). */
export function weekdayOf(key: string): number {
  return new Date(`${key.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
}

export function timeLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Browser location, or null when unavailable/denied. */
export function getPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    );
  });
}
