const DEV_SECRET = "dev-only-secret-do-not-use-in-production";

export function getAuthSecret() {
  const value = process.env.AUTH_SECRET ?? process.env.JWT_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("Set AUTH_SECRET before starting the app.");
  }
  return new TextEncoder().encode(value ?? DEV_SECRET);
}
