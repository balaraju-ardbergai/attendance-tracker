import { handleRoute, ok } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  return handleRoute(async () => {
    await clearSessionCookie();
    return ok({ message: "Signed out." });
  });
}
