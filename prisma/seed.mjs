// Seeds one local Director only. The Director adds every other account through the app.
// Run with: npm run db:seed   (requires a reachable DATABASE_URL)

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DIRECTOR = {
  email: "director@org.com",
  name: "Director",
  password: "ChangeMe@123!",
};

const OLD_DEMO_EMAILS = [
  "hr@org.com",
  "employee@org.com",
  "sara@org.com",
  "david@org.com",
  "anita@org.com",
];

async function main() {
  const passwordHash = await bcrypt.hash(DIRECTOR.password, 10);

  await prisma.user.deleteMany({ where: { email: { in: OLD_DEMO_EMAILS } } });

  await prisma.user.upsert({
    where: { email: DIRECTOR.email },
    update: {
      name: DIRECTOR.name,
      role: "DIRECTOR",
      isActive: true,
      passwordHash,
      mustResetPassword: true,
    },
    create: {
      email: DIRECTOR.email,
      name: DIRECTOR.name,
      role: "DIRECTOR",
      passwordHash,
      mustResetPassword: true,
      isActive: true,
    },
  });

  console.log("\nSeed complete. Initial Director:");
  console.log(`  ${DIRECTOR.email} password: ${DIRECTOR.password}`);
  console.log("  Change this password immediately after first login.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
