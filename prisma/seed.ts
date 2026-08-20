import "dotenv/config";

import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { permissionCodes } from "../src/types/application";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DATABASE_URL is required to seed the database.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const roles = [
  ["MANAGING_DIRECTOR", "Managing Director"],
  ["PROJECT_DIRECTOR", "Project Director"],
  ["BUSINESS_DEVELOPMENT_DIRECTOR", "Business Development Director"],
  ["PROJECT_MANAGER", "Project Manager"],
  ["PURCHASE_MANAGER", "Purchase Manager"],
  ["ACCOUNTS", "Accounts"],
  ["SITE_SUPERVISOR", "Site Supervisor"],
  ["STORE_KEEPER", "Store Keeper"],
  ["SYSTEM_ADMINISTRATOR", "System Administrator"],
] as const;

const departments = [
  ["MANAGEMENT", "Management"],
  ["PROJECTS", "Projects"],
  ["PROCUREMENT", "Procurement"],
  ["ACCOUNTS", "Accounts"],
  ["STORES", "Stores"],
  ["SITE_OPERATIONS", "Site Operations"],
  ["ADMINISTRATION", "Administration"],
] as const;

const positions = [
  ["MANAGING_DIRECTOR", "Managing Director", "MANAGEMENT"],
  ["PROJECT_DIRECTOR", "Project Director", "PROJECTS"],
  [
    "BUSINESS_DEVELOPMENT_DIRECTOR",
    "Business Development Director",
    "MANAGEMENT",
  ],
  ["PROJECT_MANAGER", "Project Manager", "PROJECTS"],
  ["PURCHASE_MANAGER", "Purchase Manager", "PROCUREMENT"],
  ["ACCOUNTS_EXECUTIVE", "Accounts Executive", "ACCOUNTS"],
  ["SITE_SUPERVISOR", "Site Supervisor", "SITE_OPERATIONS"],
  ["STORE_KEEPER", "Store Keeper", "STORES"],
  ["SYSTEM_ADMINISTRATOR", "System Administrator", "ADMINISTRATION"],
] as const;

async function main() {
  for (const [code, name] of departments) {
    await prisma.department.upsert({
      where: { code },
      update: { name, isActive: true },
      create: { code, name },
    });
  }

  for (const [code, name] of roles) {
    await prisma.role.upsert({
      where: { code },
      update: { name, isActive: true },
      create: {
        code,
        name,
        isSystem: true,
        description: "Initial KDIPL role; grants remain configurable.",
      },
    });
  }

  for (const [code, name, departmentCode] of positions) {
    const department = await prisma.department.findUniqueOrThrow({
      where: { code: departmentCode },
      select: { id: true },
    });
    await prisma.position.upsert({
      where: { code },
      update: { name, departmentId: department.id, isActive: true },
      create: { code, name, departmentId: department.id },
    });
  }

  for (const code of permissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: {
        code,
        description: `Allows ${code.replaceAll("_", " ").replaceAll(".", " ")}.`,
      },
    });
  }

  const administratorRole = await prisma.role.findUniqueOrThrow({
    where: { code: "SYSTEM_ADMINISTRATOR" },
  });
  const permissions = await prisma.permission.findMany({
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: permissions.map(({ id }) => ({
      roleId: administratorRole.id,
      permissionId: id,
    })),
    skipDuplicates: true,
  });

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  if (!email || !password || !displayName) {
    console.info(
      "Seeded departments, roles, and permissions. Bootstrap administrator was not configured.",
    );
    return;
  }
  if (password.length < 12)
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.upsert({
    where: { emailNormalized: email },
    update: {
      displayName,
      email,
      passwordHash,
      status: "ACTIVE",
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      authVersion: { increment: 1 },
    },
    create: {
      displayName,
      email,
      emailNormalized: email,
      passwordHash,
      passwordChangedAt: new Date(),
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: administratorRole.id } },
    update: {},
    create: { userId: user.id, roleId: administratorRole.id },
  });
  console.info(`Seeded bootstrap administrator for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
