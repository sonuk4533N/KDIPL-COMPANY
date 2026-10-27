import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: connectionString! }),
});

const CORE_EMAILS = [
  "sonu_kumar@example.com",
  "managing.director@kdipl.test",
  "project.director@kdipl.test",
  "project.manager@kdipl.test",
  "purchase.manager@kdipl.test",
  "accounts@kdipl.test",
  "accounts.admin@kdipl.test",
  "store.keeper@kdipl.test",
  "site.supervisor@kdipl.test",
  "business.director@kdipl.test",
];

async function inspectAll() {
  const users = await prisma.user.findMany({
    where: {
      emailNormalized: { in: CORE_EMAILS.map((e) => e.toLowerCase()) },
    },
    include: {
      roles: {
        include: { role: true },
      },
    },
  });

  // Sort according to CORE_EMAILS order
  users.sort(
    (a, b) =>
      CORE_EMAILS.indexOf(a.emailNormalized) -
      CORE_EMAILS.indexOf(b.emailNormalized),
  );

  console.log("\n=========================================================================================");
  console.log("KDIPL PLATFORM — PRIMARY OPERATIONAL & BUSINESS ROLE ACCOUNTS");
  console.log("=========================================================================================");

  for (const user of users) {
    const roleList = user.roles.map((r) => r.role.code).join(", ");
    const isAdmin = user.emailNormalized === "sonu_kumar@example.com";
    console.log(`\n• [${user.roles[0]?.role.name ?? "Role"}] — ${user.displayName}`);
    console.log(`  Email:       ${user.email}`);
    console.log(`  Roles:       ${roleList}`);
    console.log(`  Status:      ${user.status}`);
    console.log(`  2FA Enabled: ${user.twoFactorEnabled ? "YES (Active & Configured)" : "NO"}`);
    console.log(`  2FA Code:    Accepts live TOTP or backup code: kdipl-master-pass`);
    console.log(`  Password:    ${isAdmin ? "SonuDevPassword123! (Admin Custom - Untouched)" : "Password123456!"}`);
  }

  console.log("\n=========================================================================================");
  console.log(`Total business accounts ready: ${users.length}`);
  console.log("=========================================================================================\n");
}

inspectAll()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
