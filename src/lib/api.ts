import { NextResponse } from "next/server";
import { prisma } from "./db";
import { getSession, type AppRole, type SessionPayload } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export async function handleRoute(fn: () => Promise<NextResponse>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json(
        { error: "A record with this value already exists." },
        { status: 409 },
      );
    }
    console.error("[api] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid request body");
  }
}

/**
 * Authenticates the caller and re-checks the database so role changes,
 * deactivations and forced password resets take effect immediately — the JWT
 * alone (valid for 7 days) is never trusted for authorization.
 * Throws 403 when the user still has a temporary password.
 * Returns the session with a FRESH role plus the DB user.
 */
export async function requireUser(roles?: AppRole[]): Promise<{ session: SessionPayload; user: NonNullable<Awaited<ReturnType<typeof fetchUser>>> }> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "You must sign in first.");

  const user = await fetchUser(session.userId);
  if (!user || !user.isActive) throw new ApiError(401, "Your account is no longer active.");
  if (user.mustResetPassword) {
    throw new ApiError(403, "Set your new password before using the portal.");
  }
  if (roles && !roles.includes(user.role)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }

  // Refresh the session payload so callers always branch on live values.
  const fresh: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustResetPassword: user.mustResetPassword,
  };
  return { session: fresh, user };
}

export async function requireActiveUser(roles?: AppRole[]) {
  return requireUser(roles);
}

export async function requireExpenseAccess() {
  const { session, user } = await requireUser();
  if (user.role !== "DIRECTOR" && user.role !== "ADMIN" && !user.expenseAccess) {
    throw new ApiError(403, "You do not have access to Expenses.");
  }
  return { session, user };
}

async function fetchUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}
