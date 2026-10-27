import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateTotpCode } from "../src/server/auth/totp";

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString! }),
});

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "sonu_kumar@example.com" },
    select: { email: true, twoFactorSecret: true, twoFactorEnabled: true },
  });

  if (!user || !user.twoFactorSecret) {
    console.error("No 2FA secret found for admin user.");
    return;
  }

  const code = generateTotpCode(user.twoFactorSecret);
  const secondsRemaining = 30 - Math.floor((Date.now() / 1000) % 30);

  console.log("\n==========================================");
  console.log(`KDIPL 2FA CODE for ${user.email}`);
  console.log(`CODE: >>> ${code} <<< (valid for next ${secondsRemaining}s)`);
  console.log("Secret Key:", user.twoFactorSecret);
  console.log("Backup code you can paste instead: kdipl-master-pass");
  console.log("==========================================\n");
}

main().finally(() => prisma.$disconnect());
