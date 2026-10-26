import { NextResponse } from "next/server";
import { prisma } from "./db";
import { getSession, type AppRole } from "./auth";

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

export async function requireUser(roles?: AppRole[]) {
  const session = await getSession();
  if (!session) throw new ApiError(401, "You must sign in first.");
  if (roles && !roles.includes(session.role)) {
    throw new ApiError(403, "You do not have permission to perform this action.");
  }
  return session;
}

export async function requireActiveUser(roles?: AppRole[]) {
  const session = await requireUser(roles);
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) throw new ApiError(401, "Your account is no longer active.");
  return { session, user };
}

// Expenses are for Directors/HR by default; Directors/HR can grant access to anyone.
export async function requireExpenseAccess() {
  const { session, user } = await requireActiveUser();
  if (session.role !== "DIRECTOR" && session.role !== "ADMIN" && !user.expenseAccess) {
    throw new ApiError(403, "You do not have access to Expenses.");
  }
  return { session, user };
}
