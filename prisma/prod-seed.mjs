import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const email = process.env.INITIAL_DIRECTOR_EMAIL?.toLowerCase().trim();
  const password = process.env.INITIAL_DIRECTOR_PASSWORD;
  const name = process.env.INITIAL_DIRECTOR_NAME?.trim() || "Director";

  if (!email || !EMAIL_RE.test(email)) {
    throw new Error("Set INITIAL_DIRECTOR_EMAIL to a valid email before deploying.");
  }
  if (!password || password.length < 8) {
    throw new Error("Set INITIAL_DIRECTOR_PASSWORD to at least 8 characters before deploying.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const resetPassword = process.env.INITIAL_DIRECTOR_RESET_PASSWORD === "true";

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: "DIRECTOR",
      isActive: true,
      ...(resetPassword ? { passwordHash, mustResetPassword: true } : {}),
    },
    create: {
      email,
      name,
      role: "DIRECTOR",
      isActive: true,
      mustResetPassword: true,
      passwordHash,
    },
  });

  console.log(`Production Director ready: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
