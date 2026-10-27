import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateTotpCode } from "../src/server/auth/totp";

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString! }),
});

async function run() {
  const user = await prisma.user.findFirst({
    where: { email: "sonu_kumar@example.com" },
    include: {
      roles: { include: { role: true } },
    },
  });

  if (!user) {
    console.log("User not found");
    return;
  }

  console.log("User found:", {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    twoFactorSecret: user.twoFactorSecret,
    twoFactorBackupCodesCount: user.twoFactorBackupCodes.length,
    roles: user.roles.map((r) => r.role.code),
  });

  if (user.twoFactorSecret) {
    console.log("Current TOTP code:", generateTotpCode(user.twoFactorSecret));
  }
}

run().finally(() => prisma.$disconnect());
