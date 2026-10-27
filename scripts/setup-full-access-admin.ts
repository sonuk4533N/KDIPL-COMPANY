import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import argon2 from "argon2";
import { generateTotpCode, generateTotpUri } from "../src/server/auth/totp";

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString! }),
});

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

const KNOWN_SECRET = "KDIPL2FASECRETKEYFORSONUKUMAR26";

const BACKUP_CODES = [
  "kdipl-backup-1111",
  "kdipl-backup-2222",
  "kdipl-backup-3333",
  "kdipl-backup-4444",
  "kdipl-backup-5555",
  "kdipl-backup-6666",
  "kdipl-backup-7777",
  "kdipl-backup-8888",
  "kdipl-backup-9999",
  "kdipl-master-pass",
];

async function setup() {
  const user = await prisma.user.findFirst({
    where: { email: "sonu_kumar@example.com" },
  });

  if (!user) {
    throw new Error("Admin user sonu_kumar@example.com not found!");
  }

  // 1. Fetch all active roles in the database
  const allRoles = await prisma.role.findMany({
    where: { isActive: true },
  });

  console.log(`Found ${allRoles.length} roles to assign.`);

  for (const role of allRoles) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });
  }

  // 2. Set 2FA secret and pre-hashed backup codes
  const hashedBackupCodes = BACKUP_CODES.map(hashBackupCode);

  const newPasswordHash = await argon2.hash(
    process.env.BOOTSTRAP_ADMIN_PASSWORD || "SonuDevPassword123!",
    {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    },
  );

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
      twoFactorSecret: KNOWN_SECRET,
      twoFactorEnabled: true,
      twoFactorEnrolledAt: new Date(),
      twoFactorBackupCodes: hashedBackupCodes,
    },
  });

  const totpUri = generateTotpUri({
    issuer: "KDIPL Operations Platform",
    accountName: user.email,
    secret: KNOWN_SECRET,
  });

  const currentCode = generateTotpCode(KNOWN_SECRET);

  console.log("\n========================================================");
  console.log("FULL ACCESS & TWO-FACTOR AUTHENTICATION CONFIGURED");
  console.log("========================================================");
  console.log(`User: ${user.email} (${user.displayName})`);
  console.log(`Assigned Roles: ${allRoles.map((r) => r.code).join(", ")}`);
  console.log(`2FA Status: ENABLED & ACTIVE`);
  console.log(`Secret Key (for Authenticator App): ${KNOWN_SECRET}`);
  console.log(`Current Live TOTP Code: ${currentCode}`);
  console.log(`TOTP URI (for QR/App import): ${totpUri}`);
  console.log(
    "\nEmergency Backup Recovery Codes (Single-use or direct login):",
  );
  BACKUP_CODES.forEach((c, idx) => console.log(`  [${idx + 1}] ${c}`));
  console.log("========================================================\n");
}

setup()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
