import "dotenv/config";
import argon2 from "argon2";
import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString! }),
});

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

const COMMON_PASSWORD = "Password123456!";
const KNOWN_2FA_SECRET = "KDIPL2FASECRETKEYFORSONUKUMAR26";
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

const demoBusinessUsers = [
  {
    employeeCode: "DEMO-MD-001",
    roleCode: "MANAGING_DIRECTOR",
    email: "managing.director@kdipl.test",
    displayName: "Demo Managing Director",
  },
  {
    employeeCode: "DEMO-ACC-001",
    roleCode: "ACCOUNTS",
    email: "accounts@kdipl.test",
    displayName: "Demo Accounts Verifier",
  },
  {
    employeeCode: "DEMO-BDD-001",
    roleCode: "BUSINESS_DEVELOPMENT_DIRECTOR",
    email: "business.director@kdipl.test",
    displayName: "Demo Business Development Director",
  },
  {
    employeeCode: "DEMO-ACCA-001",
    roleCode: "ACCOUNTS_ADMIN",
    email: "accounts.admin@kdipl.test",
    displayName: "Demo Accounts Administrator",
  },
  {
    employeeCode: "DEMO-PD-001",
    roleCode: "PROJECT_DIRECTOR",
    email: "project.director@kdipl.test",
    displayName: "Priya Malhotra (Project Director)",
  },
  {
    employeeCode: "DEMO-PM-001",
    roleCode: "PROJECT_MANAGER",
    email: "project.manager@kdipl.test",
    displayName: "Aarav Bhatia (Project Manager)",
  },
  {
    employeeCode: "DEMO-PUR-001",
    roleCode: "PURCHASE_MANAGER",
    email: "purchase.manager@kdipl.test",
    displayName: "Nikhil Arora (Purchase Manager)",
  },
  {
    employeeCode: "DEMO-SS-001",
    roleCode: "SITE_SUPERVISOR",
    email: "site.supervisor@kdipl.test",
    displayName: "Rohan Sethi (Site Supervisor)",
  },
  {
    employeeCode: "DEMO-SK-001",
    roleCode: "STORE_KEEPER",
    email: "store.keeper@kdipl.test",
    displayName: "Vikram Rao (Store Keeper)",
  },
];

async function seedAllAccounts() {
  const passwordHash = await argon2.hash(COMMON_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const hashedBackupCodes = BACKUP_CODES.map(hashBackupCode);

  console.log("Seeding/updating all demo accounts...");

  for (const demo of demoBusinessUsers) {
    if (
      demo.email === "sonu_kumar@example.com" ||
      demo.email === process.env.BOOTSTRAP_ADMIN_EMAIL
    ) {
      continue;
    }
    const employee = await prisma.employee.findUnique({
      where: { employeeCode: demo.employeeCode },
      select: { id: true, fullName: true },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: demo.roleCode },
      select: { id: true },
    });

    const user = await prisma.user.upsert({
      where: { emailNormalized: demo.email },
      update: {
        employeeId: employee?.id ?? null,
        email: demo.email,
        displayName: employee?.fullName ?? demo.displayName,
        passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        authVersion: { increment: 1 },
        twoFactorSecret: KNOWN_2FA_SECRET,
        twoFactorEnabled: true,
        twoFactorEnrolledAt: new Date(),
        twoFactorBackupCodes: hashedBackupCodes,
      },
      create: {
        employeeId: employee?.id ?? null,
        email: demo.email,
        emailNormalized: demo.email,
        displayName: employee?.fullName ?? demo.displayName,
        passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        twoFactorSecret: KNOWN_2FA_SECRET,
        twoFactorEnabled: true,
        twoFactorEnrolledAt: new Date(),
        twoFactorBackupCodes: hashedBackupCodes,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    console.log(`✓ Configured ${demo.roleCode}: ${demo.email}`);
  }

  console.log(
    "\nAll role accounts are ready with working email, password, and 2FA backup codes! Admin was left strictly untouched.",
  );
}

seedAllAccounts()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
