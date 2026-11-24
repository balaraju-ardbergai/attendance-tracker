import { prisma } from "@/lib/db";
import { ApiError, handleRoute, ok, readJson } from "@/lib/api";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

// Simple in-memory brute-force guard: max 5 failed attempts per email per
// 15-minute window (per server instance — Vercel functions share nothing, but
// it still stops trivial credential stuffing on a single instance).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function attemptsStore() {
  const g = globalThis as unknown as { __loginAttempts?: Map<string, { count: number; resetAt: number }> };
  if (!g.__loginAttempts) g.__loginAttempts = new Map();
  return g.__loginAttempts;
}

function isLocked(key: string): boolean {
  const entry = attemptsStore().get(key);
  return Boolean(entry && entry.count >= MAX_ATTEMPTS && Date.now() < entry.resetAt);
}

function recordFailure(key: string) {
  const store = attemptsStore();
  const entry = store.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    store.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(key: string) {
  attemptsStore().delete(key);
}

export async function POST(req: Request) {
  return handleRoute(async () => {
    const { email, password } = await readJson<{ email?: string; password?: string }>(req);
    if (!email || !password) throw new ApiError(400, "Email and password are required.");

    const key = email.toLowerCase().trim();
    if (isLocked(key)) {
      throw new ApiError(429, "Too many failed attempts. Please try again in a few minutes.");
    }

    const user = await prisma.user.findUnique({
      where: { email: key },
    });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      recordFailure(key);
      throw new ApiError(401, "Invalid email or password.");
    }
    clearAttempts(key);

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustResetPassword: user.mustResetPassword,
    });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustResetPassword: user.mustResetPassword,
      },
    });
  });
}
