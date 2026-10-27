import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString! }),
});

async function main() {
  const passwordHash = await argon2.hash("Password123456!", {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const role = await prisma.role.findFirst({
    where: { code: "PROJECT_MANAGER" },
  });

  const user = await prisma.user.upsert({
    where: { emailNormalized: "first_time_user@kdipl.test" },
    update: {
      passwordHash,
      status: "ACTIVE",
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorEnrolledAt: null,
      twoFactorBackupCodes: [],
    },
    create: {
      email: "first_time_user@kdipl.test",
      emailNormalized: "first_time_user@kdipl.test",
      displayName: "New Team Member",
      passwordHash,
      status: "ACTIVE",
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorEnrolledAt: null,
      twoFactorBackupCodes: [],
    },
  });

  if (role) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log("Successfully created/reset user first_time_user@kdipl.test with twoFactorEnabled: false");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
