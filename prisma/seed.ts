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
  ["ACCOUNTS_ADMIN", "Accounts Admin"],
  ["SITE_SUPERVISOR", "Site Supervisor"],
  ["STORE_KEEPER", "Store Keeper"],
  ["SYSTEM_ADMINISTRATOR", "System Administrator"],
] as const;

const businessRoleGrants = {
  MANAGING_DIRECTOR: [
    "app.access",
    "project.view",
    "site.view",
    "catalog.view",
    "supplier.view",
    "material_requirement.view",
    "purchase.view",
    "inventory.view",
    "invoice.view",
    "invoice.approve",
    "payment.view",
    "payment.approve",
    "report.view",
    "report.export",
    "notification.view",
    "audit.view",
  ],
  ACCOUNTS: [
    "app.access",
    "inventory.view",
    "project.view",
    "purchase.view",
    "invoice.view",
    "invoice.create",
    "invoice.match",
    "invoice.verify",
    "payment.view",
    "payment.create",
    "tally.export",
    "report.view",
    "report.export",
    "notification.view",
  ],
  ACCOUNTS_ADMIN: [
    "app.access",
    "inventory.view",
    "project.view",
    "purchase.view",
    "invoice.view",
    "invoice.create",
    "invoice.match",
    "invoice.verify",
    "payment.view",
    "payment.create",
    "tax.manage",
    "tally.export",
    "report.view",
    "report.export",
    "notification.view",
  ],
  SITE_SUPERVISOR: [
    "app.access",
    "project.view",
    "site.view",
    "material_requirement.view",
    "material_requirement.create",
    "inventory.view",
    "inventory.receive",
    "report.view",
    "notification.view",
  ],
  PROJECT_MANAGER: [
    "inventory.view",
    "app.access",
    "project.view",
    "site.view",
    "material_requirement.view",
    "material_requirement.create",
    "material_requirement.approve",
    "report.view",
    "notification.view",
  ],
  PROJECT_DIRECTOR: [
    "inventory.view",
    "app.access",
    "project.view",
    "site.view",
    "material_requirement.view",
    "material_requirement.approve",
    "purchase.view",
    "purchase.approve",
    "report.view",
    "report.export",
    "notification.view",
  ],
  BUSINESS_DEVELOPMENT_DIRECTOR: [
    "app.access",
    "project.view",
    "site.view",
    "report.view",
    "report.export",
    "notification.view",
  ],
  PURCHASE_MANAGER: [
    "app.access",
    "project.view",
    "site.view",
    "catalog.view",
    "supplier.view",
    "material_requirement.view",
    "purchase.view",
    "purchase.create",
    "report.view",
    "report.export",
    "notification.view",
  ],
  STORE_KEEPER: [
    "app.access",
    "inventory.view",
    "inventory.receive",
    "report.view",
    "notification.view",
  ],
} as const;

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
  ["ACCOUNTS_ADMIN", "Accounts Admin", "ACCOUNTS"],
  ["SITE_SUPERVISOR", "Site Supervisor", "SITE_OPERATIONS"],
  ["STORE_KEEPER", "Store Keeper", "STORES"],
  ["SYSTEM_ADMINISTRATOR", "System Administrator", "ADMINISTRATION"],
] as const;

const phase2Employees = [
  {
    employeeCode: "DEMO-MD-001",
    fullName: "Demo Managing Director",
    designation: "Managing Director",
    email: "managing.director@kdipl.test",
    departmentCode: "MANAGEMENT",
    positionCode: "MANAGING_DIRECTOR",
  },
  {
    employeeCode: "DEMO-ACC-001",
    fullName: "Demo Accounts Verifier",
    designation: "Accounts Executive",
    email: "accounts@kdipl.test",
    departmentCode: "ACCOUNTS",
    positionCode: "ACCOUNTS_EXECUTIVE",
  },
  {
    employeeCode: "DEMO-BDD-001",
    fullName: "Demo Business Development Director",
    designation: "Business Development Director",
    email: "business.director@kdipl.test",
    departmentCode: "MANAGEMENT",
    positionCode: "BUSINESS_DEVELOPMENT_DIRECTOR",
  },
  {
    employeeCode: "DEMO-ACCA-001",
    fullName: "Demo Accounts Administrator",
    designation: "Accounts Administrator",
    email: "accounts.admin@kdipl.test",
    departmentCode: "ACCOUNTS",
    positionCode: "ACCOUNTS_ADMIN",
  },
  {
    employeeCode: "DEMO-PD-001",
    fullName: "Priya Malhotra",
    designation: "Project Director",
    email: "project.director@kdipl.test",
    departmentCode: "PROJECTS",
    positionCode: "PROJECT_DIRECTOR",
  },
  {
    employeeCode: "DEMO-PUR-001",
    fullName: "Nikhil Arora",
    designation: "Purchase Manager",
    email: "purchase.manager@kdipl.test",
    departmentCode: "PROCUREMENT",
    positionCode: "PURCHASE_MANAGER",
  },
  {
    employeeCode: "DEMO-SK-001",
    fullName: "Vikram Rao",
    designation: "Store Keeper",
    email: "store.keeper@kdipl.test",
    departmentCode: "STORES",
    positionCode: "STORE_KEEPER",
  },
  {
    employeeCode: "DEMO-PM-001",
    fullName: "Aarav Bhatia",
    designation: "Project Manager",
    email: "project.manager@kdipl.test",
    departmentCode: "PROJECTS",
    positionCode: "PROJECT_MANAGER",
  },
  {
    employeeCode: "DEMO-PM-002",
    fullName: "Meera Khanna",
    designation: "Project Manager",
    email: "meera.khanna@example.com",
    departmentCode: "PROJECTS",
    positionCode: "PROJECT_MANAGER",
  },
  {
    employeeCode: "DEMO-SS-001",
    fullName: "Rohan Sethi",
    designation: "Site Supervisor",
    email: "site.supervisor@kdipl.test",
    departmentCode: "SITE_OPERATIONS",
    positionCode: "SITE_SUPERVISOR",
  },
  {
    employeeCode: "DEMO-SS-002",
    fullName: "Kavya Nair",
    designation: "Site Supervisor",
    email: "kavya.nair@example.com",
    departmentCode: "SITE_OPERATIONS",
    positionCode: "SITE_SUPERVISOR",
  },
] as const;

const demoBusinessUsers = [
  {
    employeeCode: "DEMO-MD-001",
    roleCode: "MANAGING_DIRECTOR",
    email: "managing.director@kdipl.test",
  },
  {
    employeeCode: "DEMO-ACC-001",
    roleCode: "ACCOUNTS",
    email: "accounts@kdipl.test",
  },
  {
    employeeCode: "DEMO-BDD-001",
    roleCode: "BUSINESS_DEVELOPMENT_DIRECTOR",
    email: "business.director@kdipl.test",
  },
  {
    employeeCode: "DEMO-ACCA-001",
    roleCode: "ACCOUNTS_ADMIN",
    email: "accounts.admin@kdipl.test",
  },
  {
    employeeCode: "DEMO-PD-001",
    roleCode: "PROJECT_DIRECTOR",
    email: "project.director@kdipl.test",
  },
  {
    employeeCode: "DEMO-PM-001",
    roleCode: "PROJECT_MANAGER",
    email: "project.manager@kdipl.test",
  },
  {
    employeeCode: "DEMO-PUR-001",
    roleCode: "PURCHASE_MANAGER",
    email: "purchase.manager@kdipl.test",
  },
  {
    employeeCode: "DEMO-SS-001",
    roleCode: "SITE_SUPERVISOR",
    email: "site.supervisor@kdipl.test",
  },
  {
    employeeCode: "DEMO-SK-001",
    roleCode: "STORE_KEEPER",
    email: "store.keeper@kdipl.test",
  },
] as const;

const phase2Clients = [
  {
    clientCode: "CL-DLF",
    name: "DLF Residence Client",
    address: "Sector 42, Golf Course Road",
    city: "Gurugram",
    state: "Haryana",
    postalCode: "122002",
    phone: "+91 124 400 1000",
    email: "projects.dlf@example.com",
  },
  {
    clientCode: "CL-NOIDA-CORP",
    name: "Noida Corporate Services Pvt. Ltd.",
    address: "Sector 62",
    city: "Noida",
    state: "Uttar Pradesh",
    postalCode: "201309",
    phone: "+91 120 400 2000",
    email: "facilities.noida@example.com",
  },
  {
    clientCode: "CL-GGM-VILLA",
    name: "Gurugram Villa Client",
    address: "Golf Course Extension Road",
    city: "Gurugram",
    state: "Haryana",
    postalCode: "122018",
    phone: "+91 124 400 3000",
    email: "villa.gurugram@example.com",
  },
  {
    clientCode: "CL-DEL-RETAIL",
    name: "Delhi Retail Ventures Pvt. Ltd.",
    address: "Saket District Centre",
    city: "New Delhi",
    state: "Delhi",
    postalCode: "110017",
    phone: "+91 11 4000 4000",
    email: "projects.delhi@example.com",
  },
] as const;

const phase2Projects = [
  {
    projectCode: "PRJ-DLF-001",
    name: "DLF Residence",
    clientCode: "CL-DLF",
    location: "Delhi NCR",
    description: "Residential interior execution and finishing works.",
    status: "ACTIVE",
    startDate: "2026-01-15",
    expectedCompletionDate: "2026-12-31",
  },
  {
    projectCode: "PRJ-NOI-002",
    name: "Corporate Office — Noida",
    clientCode: "CL-NOIDA-CORP",
    location: "Noida",
    description: "Corporate office fitout and services coordination.",
    status: "ACTIVE",
    startDate: "2026-02-10",
    expectedCompletionDate: "2026-11-30",
  },
  {
    projectCode: "PRJ-GGM-003",
    name: "Villa Interior — Gurugram",
    clientCode: "CL-GGM-VILLA",
    location: "Gurugram",
    description: "Premium villa interior and joinery works.",
    status: "ACTIVE",
    startDate: "2026-03-01",
    expectedCompletionDate: "2026-10-31",
  },
  {
    projectCode: "PRJ-DEL-004",
    name: "Retail Fitout — Delhi",
    clientCode: "CL-DEL-RETAIL",
    location: "New Delhi",
    description: "Retail unit planning, procurement, and fitout.",
    status: "PLANNING",
    startDate: "2026-09-01",
    expectedCompletionDate: "2027-02-28",
  },
] as const;

const phase2Sites = [
  {
    projectCode: "PRJ-DLF-001",
    siteCode: "FLOOR-03",
    name: "Floor 3",
    location: "DLF Residence, Tower A",
    address: "Sector 42, Golf Course Road, Gurugram",
    description: "Primary residential execution floor.",
    status: "ACTIVE",
  },
  {
    projectCode: "PRJ-DLF-001",
    siteCode: "PROJECT-STORE",
    name: "Project Store",
    location: "DLF Residence Service Area",
    address: "Sector 42, Golf Course Road, Gurugram",
    description: "Controlled project material receiving and storage area.",
    status: "ACTIVE",
  },
  {
    projectCode: "PRJ-NOI-002",
    siteCode: "FLOOR-01",
    name: "Floor 1 Office",
    location: "Sector 62, Noida",
    address: "Corporate Office Building, Sector 62, Noida",
    description: "Corporate office fitout workfront.",
    status: "ACTIVE",
  },
  {
    projectCode: "PRJ-GGM-003",
    siteCode: "MAIN-VILLA",
    name: "Main Villa",
    location: "Golf Course Extension Road, Gurugram",
    address: "Gurugram, Haryana",
    description: "Main interior and finishing workfront.",
    status: "ACTIVE",
  },
  {
    projectCode: "PRJ-DEL-004",
    siteCode: "RETAIL-UNIT",
    name: "Retail Unit",
    location: "Saket, New Delhi",
    address: "Saket District Centre, New Delhi",
    description: "Planned retail fitout workfront.",
    status: "PLANNING",
  },
] as const;

const phase2ProjectAssignments = [
  ["PRJ-DLF-001", "DEMO-PM-001"],
  ["PRJ-NOI-002", "DEMO-PM-002"],
  ["PRJ-GGM-003", "DEMO-PM-001"],
  ["PRJ-DEL-004", "DEMO-PM-002"],
] as const;

const phase2SiteAssignments = [
  ["PRJ-DLF-001", "FLOOR-03", "DEMO-SS-001"],
  ["PRJ-DLF-001", "PROJECT-STORE", "DEMO-SS-002"],
  ["PRJ-NOI-002", "FLOOR-01", "DEMO-SS-001"],
  ["PRJ-GGM-003", "MAIN-VILLA", "DEMO-SS-002"],
  ["PRJ-DEL-004", "RETAIL-UNIT", "DEMO-SS-001"],
] as const;

const phase2Categories = [
  ["CEMENT", "Cement", "Cement and cementitious products."],
  ["ELECTRICAL", "Electrical", "Electrical cables, conduits, and accessories."],
  ["PLUMBING", "Plumbing", "Plumbing pipes, fittings, and accessories."],
  ["DRYWALL", "Drywall", "Gypsum boards and drywall systems."],
  ["TILES", "Tiles", "Floor and wall tile materials."],
  ["PLYWOOD", "Plywood", "Plywood, boards, and related sheet goods."],
  ["METAL", "Metal", "Structural and fabricated metal materials."],
  ["FINISHES", "Finishes", "Putty, paint, and surface finishing materials."],
] as const;

const phase2Units = [
  ["BAG", "Bag", "bag", 0],
  ["PCS", "Piece", "pc", 0],
  ["M", "Metre", "m", 3],
  ["SQFT", "Square Foot", "sq ft", 3],
  ["KG", "Kilogram", "kg", 3],
  ["LTR", "Litre", "L", 3],
  ["BOX", "Box", "box", 0],
  ["ROLL", "Roll", "roll", 0],
  ["SHEET", "Sheet", "sheet", 0],
] as const;

const phase2Materials = [
  ["MAT-CEM-OPC43", "Cement OPC 43", "CEMENT", "BAG", "50", "100"],
  ["MAT-CBL-4SQ", "Electrical Cable 4 sqmm", "ELECTRICAL", "M", "200", "500"],
  ["MAT-PVC-25MM", "PVC Conduit 25mm", "ELECTRICAL", "M", "100", "250"],
  ["MAT-GYP-12MM", "Gypsum Board 12mm", "DRYWALL", "SHEET", "25", "60"],
  ["MAT-TILE-BEIGE", "Italian Tile — Beige", "TILES", "SQFT", "100", "300"],
  ["MAT-PLY-18MM", "Plywood 18mm", "PLYWOOD", "SHEET", "20", "50"],
  ["MAT-MS-SQ-PIPE", "MS Square Pipe", "METAL", "M", "50", "150"],
  ["MAT-WALL-PUTTY", "Wall Putty", "FINISHES", "BAG", "20", "50"],
  ["MAT-INT-PAINT", "Interior Paint", "FINISHES", "LTR", "40", "100"],
] as const;

const phase2Suppliers = [
  {
    supplierCode: "SUP-ABC-BUILD",
    legalName: "ABC Building Materials Pvt. Ltd.",
    tradeName: "ABC Building Materials",
    gstin: "07ABCDE1234F1Z5",
    address: "Okhla Industrial Area Phase II",
    city: "New Delhi",
    state: "Delhi",
    postalCode: "110020",
    phone: "+91 11 4000 1001",
    email: "sales.abc@example.com",
    contact: {
      name: "Amit Verma",
      designation: "Sales Manager",
      phone: "+91 98100 01001",
      email: "amit.abc@example.com",
    },
  },
  {
    supplierCode: "SUP-METRO-ELEC",
    legalName: "Metro Electrical Traders",
    tradeName: "Metro Electricals",
    gstin: "09FGHIJ2345K1Z6",
    address: "Sector 9 Industrial Market",
    city: "Noida",
    state: "Uttar Pradesh",
    postalCode: "201301",
    phone: "+91 120 400 2001",
    email: "sales.metro@example.com",
    contact: {
      name: "Neha Singh",
      designation: "Account Manager",
      phone: "+91 98100 02001",
      email: "neha.metro@example.com",
    },
  },
  {
    supplierCode: "SUP-NATIONAL-HW",
    legalName: "National Hardware & Plywood",
    tradeName: "National Hardware",
    gstin: "06KLMNO3456P1Z7",
    address: "Basai Road Industrial Area",
    city: "Gurugram",
    state: "Haryana",
    postalCode: "122001",
    phone: "+91 124 400 3001",
    email: "sales.national@example.com",
    contact: {
      name: "Rohit Mehta",
      designation: "Business Development Executive",
      phone: "+91 98100 03001",
      email: "rohit.national@example.com",
    },
  },
  {
    supplierCode: "SUP-DELHI-TILE",
    legalName: "Delhi Tile House",
    tradeName: "Delhi Tile House",
    gstin: "07QRSTU4567V1Z8",
    address: "Kirti Nagar Industrial Area",
    city: "New Delhi",
    state: "Delhi",
    postalCode: "110015",
    phone: "+91 11 4000 4001",
    email: "sales.tiles@example.com",
    contact: {
      name: "Priya Arora",
      designation: "Showroom Manager",
      phone: "+91 98100 04001",
      email: "priya.tiles@example.com",
    },
  },
] as const;

function requiredId(ids: Map<string, string>, code: string) {
  const id = ids.get(code);
  if (!id) throw new Error(`Missing seeded Phase 2 reference: ${code}.`);
  return id;
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function phase2SiteKey(projectCode: string, siteCode: string) {
  return `${projectCode}:${siteCode}`;
}

async function seedPhase2() {
  const clientIds = new Map<string, string>();
  for (const client of phase2Clients) {
    const record = await prisma.client.upsert({
      where: { clientCode: client.clientCode },
      update: {},
      create: client,
      select: { id: true },
    });
    clientIds.set(client.clientCode, record.id);
  }

  const projectIds = new Map<string, string>();
  for (const project of phase2Projects) {
    const record = await prisma.project.upsert({
      where: { projectCode: project.projectCode },
      update: {},
      create: {
        projectCode: project.projectCode,
        name: project.name,
        clientId: requiredId(clientIds, project.clientCode),
        location: project.location,
        description: project.description,
        status: project.status,
        startDate: dateOnly(project.startDate),
        expectedCompletionDate: dateOnly(project.expectedCompletionDate),
      },
      select: { id: true },
    });
    projectIds.set(project.projectCode, record.id);
  }

  const siteIds = new Map<string, string>();
  for (const site of phase2Sites) {
    const projectId = requiredId(projectIds, site.projectCode);
    const record = await prisma.site.upsert({
      where: {
        projectId_siteCode: { projectId, siteCode: site.siteCode },
      },
      update: {},
      create: {
        siteCode: site.siteCode,
        name: site.name,
        projectId,
        location: site.location,
        address: site.address,
        description: site.description,
        status: site.status,
      },
      select: { id: true },
    });
    siteIds.set(phase2SiteKey(site.projectCode, site.siteCode), record.id);
  }

  const organizationIds = new Map<string, string>();
  for (const employee of phase2Employees) {
    if (!organizationIds.has(`department:${employee.departmentCode}`)) {
      const department = await prisma.department.findUniqueOrThrow({
        where: { code: employee.departmentCode },
        select: { id: true },
      });
      organizationIds.set(
        `department:${employee.departmentCode}`,
        department.id,
      );
    }
    if (!organizationIds.has(`position:${employee.positionCode}`)) {
      const position = await prisma.position.findUniqueOrThrow({
        where: { code: employee.positionCode },
        select: { id: true },
      });
      organizationIds.set(`position:${employee.positionCode}`, position.id);
    }
  }

  const employeeIds = new Map<string, string>();
  for (const employee of phase2Employees) {
    const { departmentCode, positionCode, ...employeeData } = employee;
    const placement = {
      departmentId: requiredId(organizationIds, `department:${departmentCode}`),
      positionId: requiredId(organizationIds, `position:${positionCode}`),
    };
    const record = await prisma.employee.upsert({
      where: { employeeCode: employee.employeeCode },
      update: { ...employeeData, ...placement, isActive: true },
      create: { ...employeeData, ...placement },
      select: { id: true },
    });
    employeeIds.set(employee.employeeCode, record.id);
  }

  const assignmentStart = new Date("2026-08-01T09:00:00.000Z");
  for (const [projectCode, employeeCode] of phase2ProjectAssignments) {
    const projectId = requiredId(projectIds, projectCode);
    const employeeId = requiredId(employeeIds, employeeCode);
    await prisma.$transaction(async (transaction) => {
      await transaction.projectAssignment.updateMany({
        where: { projectId, isPrimary: true },
        data: { isPrimary: false },
      });
      await transaction.projectAssignment.upsert({
        where: {
          projectId_employeeId_role: {
            projectId,
            employeeId,
            role: "PROJECT_MANAGER",
          },
        },
        update: {
          isPrimary: true,
          isActive: true,
          startsAt: assignmentStart,
          endsAt: null,
        },
        create: {
          projectId,
          employeeId,
          role: "PROJECT_MANAGER",
          isPrimary: true,
          startsAt: assignmentStart,
        },
      });
    });
  }

  for (const [projectCode, siteCode, employeeCode] of phase2SiteAssignments) {
    const siteId = requiredId(siteIds, phase2SiteKey(projectCode, siteCode));
    const employeeId = requiredId(employeeIds, employeeCode);
    await prisma.$transaction(async (transaction) => {
      await transaction.siteAssignment.updateMany({
        where: { siteId, isPrimary: true },
        data: { isPrimary: false },
      });
      await transaction.siteAssignment.upsert({
        where: {
          siteId_employeeId_role: {
            siteId,
            employeeId,
            role: "SITE_SUPERVISOR",
          },
        },
        update: {
          isPrimary: true,
          isActive: true,
          startsAt: assignmentStart,
          endsAt: null,
        },
        create: {
          siteId,
          employeeId,
          role: "SITE_SUPERVISOR",
          isPrimary: true,
          startsAt: assignmentStart,
        },
      });
    });
  }

  const categoryIds = new Map<string, string>();
  for (const [code, name, description] of phase2Categories) {
    const record = await prisma.materialCategory.upsert({
      where: { code },
      update: { name, description },
      create: { code, name, description },
      select: { id: true },
    });
    categoryIds.set(code, record.id);
  }

  const unitIds = new Map<string, string>();
  for (const [code, name, symbol, decimalScale] of phase2Units) {
    const record = await prisma.unitOfMeasure.upsert({
      where: { code },
      update: { name, symbol, decimalScale },
      create: { code, name, symbol, decimalScale },
      select: { id: true },
    });
    unitIds.set(code, record.id);
  }

  for (const [
    materialCode,
    name,
    categoryCode,
    unitCode,
    minimum,
    reorder,
  ] of phase2Materials) {
    await prisma.material.upsert({
      where: { materialCode },
      update: {},
      create: {
        materialCode,
        name,
        categoryId: requiredId(categoryIds, categoryCode),
        defaultUnitId: requiredId(unitIds, unitCode),
        minimumStockLevel: minimum,
        reorderLevel: reorder,
      },
    });
  }

  for (const supplierData of phase2Suppliers) {
    const { contact, ...supplier } = supplierData;
    const record = await prisma.supplier.upsert({
      where: { supplierCode: supplier.supplierCode },
      update: {},
      create: { ...supplier, isGstRegistered: true },
      select: { id: true },
    });
    const existingContact = await prisma.supplierContact.findFirst({
      where: {
        supplierId: record.id,
        OR: [{ email: contact.email }, { name: contact.name }],
      },
      select: { id: true },
    });
    if (existingContact) {
      await prisma.supplierContact.update({
        where: { id: existingContact.id },
        data: {
          name: contact.name,
          designation: contact.designation,
          phone: contact.phone,
          email: contact.email,
        },
      });
    } else {
      const primaryExists = await prisma.supplierContact.findFirst({
        where: { supplierId: record.id, isActive: true, isPrimary: true },
        select: { id: true },
      });
      await prisma.supplierContact.create({
        data: {
          supplierId: record.id,
          ...contact,
          isPrimary: !primaryExists,
        },
      });
    }
  }

  console.info(
    "Seeded Phase 2 projects, sites, operating team, materials, and suppliers.",
  );
}

async function seedPhase3Draft(createdById: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { projectCode: "PRJ-DLF-001" },
    select: { id: true },
  });
  const site = await prisma.site.findUniqueOrThrow({
    where: {
      projectId_siteCode: {
        projectId: project.id,
        siteCode: "FLOOR-03",
      },
    },
    select: { id: true },
  });
  const materials = await prisma.material.findMany({
    where: {
      materialCode: { in: ["MAT-CBL-4SQ", "MAT-PVC-25MM"] },
    },
    select: { id: true, materialCode: true, defaultUnitId: true },
  });
  if (materials.length !== 2) {
    throw new Error("Missing seeded Phase 3 draft materials.");
  }
  const requirement = await prisma.materialRequirement.upsert({
    where: { requirementNumber: "MR-2026-0000" },
    update: {},
    create: {
      requirementNumber: "MR-2026-0000",
      projectId: project.id,
      siteId: site.id,
      neededBy: dateOnly("2026-09-15"),
      purpose: "Electrical rough-in materials",
      notes: "Reserved demo draft; not submitted for approval.",
      createdById,
    },
    select: { id: true, status: true },
  });
  if (requirement.status !== "DRAFT") {
    console.info("Retained submitted Phase 3 demo requirement unchanged.");
    return;
  }
  const quantities = new Map([
    ["MAT-CBL-4SQ", "250"],
    ["MAT-PVC-25MM", "120"],
  ]);
  for (const [position, material] of materials
    .sort((left, right) => left.materialCode.localeCompare(right.materialCode))
    .entries()) {
    await prisma.materialRequirementLine.upsert({
      where: {
        requirementId_materialId: {
          requirementId: requirement.id,
          materialId: material.id,
        },
      },
      update: {
        unitId: material.defaultUnitId,
        quantity: quantities.get(material.materialCode),
        position,
        isActive: true,
      },
      create: {
        requirementId: requirement.id,
        materialId: material.id,
        unitId: material.defaultUnitId,
        quantity: quantities.get(material.materialCode)!,
        position,
      },
    });
  }
  console.info("Seeded Phase 3 draft material requirement.");
}

async function seedDemoBusinessUsers(password: string) {
  if (password.length < 12) {
    throw new Error("DEMO_BUSINESS_PASSWORD must be at least 12 characters.");
  }
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const passwordChangedAt = new Date();

  for (const demo of demoBusinessUsers) {
    const [employee, role] = await Promise.all([
      prisma.employee.findUniqueOrThrow({
        where: { employeeCode: demo.employeeCode },
        select: { id: true, fullName: true },
      }),
      prisma.role.findUniqueOrThrow({
        where: { code: demo.roleCode },
        select: { id: true },
      }),
    ]);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ emailNormalized: demo.email }, { employeeId: employee.id }],
      },
      select: { id: true },
    });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            employeeId: employee.id,
            email: demo.email,
            emailNormalized: demo.email,
            displayName: employee.fullName,
            passwordHash,
            status: "ACTIVE",
            mustChangePassword: false,
            passwordChangedAt,
            authVersion: { increment: 1 },
          },
        })
      : await prisma.user.create({
          data: {
            employeeId: employee.id,
            email: demo.email,
            emailNormalized: demo.email,
            displayName: employee.fullName,
            passwordHash,
            mustChangePassword: false,
            passwordChangedAt,
          },
        });
    await prisma.$transaction(async (transaction) => {
      await transaction.userRole.deleteMany({
        where: { userId: user.id, roleId: { not: role.id } },
      });
      await transaction.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    });
  }
  console.info(
    `Seeded ${demoBusinessUsers.length} opt-in business-role demo login accounts.`,
  );
}

async function seedPhase7Demo() {
  const [accounts, managingDirector, project, supplier, material] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { emailNormalized: "accounts@kdipl.test" },
      }),
      prisma.user.findUniqueOrThrow({
        where: { emailNormalized: "managing.director@kdipl.test" },
      }),
      prisma.project.findUniqueOrThrow({
        where: { projectCode: "PRJ-DLF-001" },
      }),
      prisma.supplier.findUniqueOrThrow({
        where: { supplierCode: "SUP-NATIONAL-HW" },
      }),
      prisma.material.findUniqueOrThrow({
        where: { materialCode: "MAT-MS-SQ-PIPE" },
      }),
    ]);
  const site = await prisma.site.findUniqueOrThrow({
    where: {
      projectId_siteCode: { projectId: project.id, siteCode: "FLOOR-03" },
    },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { procurementBudget: "5000000" },
  });
  await prisma.supplier.update({
    where: { id: supplier.id },
    data: { defaultCreditDays: 30 },
  });

  const requirement = await prisma.materialRequirement.upsert({
    where: { requirementNumber: "MR-2026-P7DEMO" },
    update: {},
    create: {
      requirementNumber: "MR-2026-P7DEMO",
      projectId: project.id,
      siteId: site.id,
      neededBy: dateOnly("2026-10-15"),
      purpose: "Phase 7 accounts-payable demonstration",
      createdById: accounts.id,
    },
  });
  const requirementLine = await prisma.materialRequirementLine.upsert({
    where: {
      requirementId_materialId: {
        requirementId: requirement.id,
        materialId: material.id,
      },
    },
    update: {},
    create: {
      requirementId: requirement.id,
      materialId: material.id,
      unitId: material.defaultUnitId,
      quantity: "100",
    },
  });
  const rfq = await prisma.requestForQuotation.upsert({
    where: { rfqNumber: "RFQ-2026-P7DEMO" },
    update: {},
    create: {
      rfqNumber: "RFQ-2026-P7DEMO",
      requirementId: requirement.id,
      responseDueDate: dateOnly("2026-10-20"),
      createdById: accounts.id,
    },
  });
  let quotation = await prisma.supplierQuotation.findUnique({
    where: { rfqId_supplierId: { rfqId: rfq.id, supplierId: supplier.id } },
    include: { lines: true },
  });
  if (!quotation)
    quotation = await prisma.supplierQuotation.create({
      data: {
        rfqId: rfq.id,
        supplierId: supplier.id,
        quoteReference: "P7-DEMO-QUOTE",
        quoteDate: dateOnly("2026-09-01"),
        validUntil: dateOnly("2027-03-31"),
        offeredDeliveryDate: dateOnly("2026-09-15"),
        paymentTerms: "30 days",
        subtotal: "100000",
        gstRate: "18",
        gstAmount: "18000",
        freightAmount: "0",
        landedTotal: "118000",
        recordedById: accounts.id,
        lines: {
          create: {
            requirementLineId: requirementLine.id,
            unitId: material.defaultUnitId,
            quantity: "100",
            unitPrice: "1000",
            lineSubtotal: "100000",
          },
        },
      },
      include: { lines: true },
    });
  let purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { poNumber: "PO-2026-P7DEMO" },
    include: { lines: true },
  });
  if (!purchaseOrder)
    purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-P7DEMO",
        rfqId: rfq.id,
        quotationId: quotation.id,
        supplierId: supplier.id,
        status: "ACCEPTED",
        subtotal: "100000",
        gstRate: "18",
        gstAmount: "18000",
        freightAmount: "0",
        totalAmount: "118000",
        expectedDeliveryDate: dateOnly("2026-09-15"),
        paymentTerms: "30 days",
        creditDays: 30,
        permitsAdvance: true,
        maximumAdvancePercent: "25",
        createdById: accounts.id,
        issuedById: accounts.id,
        issuedAt: new Date("2026-09-01T09:00:00.000Z"),
        supplierAcceptedAt: new Date("2026-09-02T09:00:00.000Z"),
        supplierAcceptanceReference: "P7-DEMO-ACCEPTED",
        acceptedRecordedById: accounts.id,
        lines: {
          create: {
            quotationLineId: quotation.lines[0].id,
            requirementLineId: requirementLine.id,
            unitId: material.defaultUnitId,
            quantity: "100",
            unitPrice: "1000",
            lineSubtotal: "100000",
          },
        },
      },
      include: { lines: true },
    });
  const location = await prisma.inventoryLocation.upsert({
    where: { locationCode: "CENTRAL-DEMO" },
    update: {},
    create: {
      locationCode: "CENTRAL-DEMO",
      name: "Demo Central Store",
      type: "CENTRAL_STORE",
    },
  });
  let receipt = await prisma.goodsReceipt.findUnique({
    where: { grnNumber: "GRN-2026-P7DEMO" },
    include: { lines: true },
  });
  if (!receipt) {
    receipt = await prisma.goodsReceipt.create({
      data: {
        grnNumber: "GRN-2026-P7DEMO",
        purchaseOrderId: purchaseOrder.id,
        locationId: location.id,
        supplierDeliveryNote: "DN-P7-DEMO",
        receivedAt: new Date("2026-09-15T09:00:00.000Z"),
        createdById: accounts.id,
        lines: {
          create: {
            purchaseOrderLineId: purchaseOrder.lines[0].id,
            materialId: material.id,
            unitId: material.defaultUnitId,
            orderedQuantity: "100",
            receivedQuantity: "100",
            acceptedQuantity: "100",
          },
        },
      },
      include: { lines: true },
    });
    const verifiedAt = new Date("2026-09-15T10:00:00.000Z");
    await prisma.goodsReceipt.update({
      where: { id: receipt.id },
      data: {
        status: "PHYSICALLY_VERIFIED",
        verifiedById: accounts.id,
        verifiedAt,
      },
    });
    await prisma.goodsReceipt.update({
      where: { id: receipt.id },
      data: { status: "PENDING_PM_APPROVAL" },
    });
    await prisma.goodsReceipt.update({
      where: { id: receipt.id },
      data: {
        status: "POSTED",
        approvedById: managingDirector.id,
        approvedAt: verifiedAt,
        postedById: accounts.id,
        postedAt: verifiedAt,
      },
    });
    await prisma.stockTransaction.create({
      data: {
        transactionNumber: "STK-2026-P7DEMO",
        type: "RECEIPT",
        locationId: location.id,
        materialId: material.id,
        unitId: material.defaultUnitId,
        quantity: "100",
        goodsReceiptLineId: receipt.lines[0].id,
        reason: "Posted Phase 7 demo goods receipt",
        createdById: accounts.id,
      },
    });
  }

  await prisma.taxRuleVersion.upsert({
    where: {
      code_effectiveFrom: {
        code: "GST18-CA",
        effectiveFrom: dateOnly("2026-04-01"),
      },
    },
    update: {},
    create: {
      code: "GST18-CA",
      kind: "GST",
      rate: "18",
      effectiveFrom: dateOnly("2026-04-01"),
      settings: { caApprovalReference: "KDIPL-CA-GST-2026" },
      approvedById: accounts.id,
      createdById: accounts.id,
    },
  });
  await prisma.companyBankAccount.upsert({
    where: {
      bankName_maskedAccount: {
        bankName: "HDFC Bank",
        maskedAccount: "XXXX4421",
      },
    },
    update: { isActive: true },
    create: {
      accountName: "KDIPL Operating Account",
      bankName: "HDFC Bank",
      maskedAccount: "XXXX4421",
      ifsc: "HDFC0000123",
    },
  });
  for (const documentType of [
    "SUPPLIER_INVOICE",
    "PAYMENT_PROOF",
    "ADVANCE_PAYMENT_EVIDENCE",
    "CREDIT_NOTE",
    "DEBIT_NOTE",
  ])
    await prisma.fileRecord.upsert({
      where: { storageKey: `seed/phase7/${documentType}.pdf` },
      update: {},
      create: {
        filename: `phase7-${documentType.toLowerCase()}.pdf`,
        mimeType: "application/pdf",
        size: BigInt(128),
        storageKey: `seed/phase7/${documentType}.pdf`,
        storageProvider: "LOCAL",
        documentType,
        uploadedById: accounts.id,
        scanStatus: "CLEAN",
        scanProvider: "SEED",
        scanReference: "trusted-demo-fixture",
        scannedAt: new Date(),
        retentionUntil: dateOnly("2035-03-31"),
      },
    });
  const [accountsAdmin, storeKeeper] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { emailNormalized: "accounts.admin@kdipl.test" },
    }),
    prisma.employee.findUniqueOrThrow({
      where: { employeeCode: "DEMO-SK-001" },
    }),
  ]);
  await prisma.stockValuationPolicy.upsert({
    where: { effectiveFrom: dateOnly("2026-04-01") },
    update: { method: "QUANTITY_ONLY" },
    create: {
      method: "QUANTITY_ONLY",
      effectiveFrom: dateOnly("2026-04-01"),
      settings: { status: "AWAITING_CA_APPROVAL" },
      approvedById: accountsAdmin.id,
      createdById: accountsAdmin.id,
    },
  });
  await prisma.lowStockSetting.upsert({
    where: {
      projectId_locationId_materialId: {
        projectId: project.id,
        locationId: location.id,
        materialId: material.id,
      },
    },
    update: {
      minimumLevel: "25",
      reorderLevel: "40",
      updatedById: accounts.id,
    },
    create: {
      projectId: project.id,
      locationId: location.id,
      materialId: material.id,
      minimumLevel: "25",
      reorderLevel: "40",
      createdById: accounts.id,
      updatedById: accounts.id,
    },
  });
  await prisma.inventoryLocationAccess.upsert({
    where: {
      employeeId_locationId: {
        employeeId: storeKeeper.id,
        locationId: location.id,
      },
    },
    update: { isActive: true },
    create: { employeeId: storeKeeper.id, locationId: location.id },
  });
  const existingBudget = await prisma.projectBudgetRevision.findFirst({
    where: { projectId: project.id, workPackage: null, revisionNumber: 1 },
  });
  if (!existingBudget)
    await prisma.projectBudgetRevision.create({
      data: {
        projectId: project.id,
        revisionNumber: 1,
        approvedBudget: project.procurementBudget ?? "0",
        reason: "Opening approved project procurement budget",
        effectiveFrom: dateOnly("2026-04-01"),
        approvedById: managingDirector.id,
      },
    });
  console.info("Seeded Phase 7 fixtures and Phase 8 reporting defaults.");
}

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

  const businessPermissionCodes = Array.from(
    new Set(Object.values(businessRoleGrants).flat()),
  );
  const businessPermissions = await prisma.permission.findMany({
    where: { code: { in: businessPermissionCodes } },
    select: { id: true, code: true },
  });
  const permissionIdByCode = new Map(
    businessPermissions.map(({ id, code }) => [code, id]),
  );
  for (const [roleCode, grants] of Object.entries(businessRoleGrants)) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: roleCode },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: grants.map((code) => ({
        roleId: role.id,
        permissionId: requiredId(permissionIdByCode, code),
      })),
      skipDuplicates: true,
    });
  }

  await seedPhase2();

  const demoBusinessPassword = process.env.DEMO_BUSINESS_PASSWORD;
  if (demoBusinessPassword) {
    await seedDemoBusinessUsers(demoBusinessPassword);
    await seedPhase7Demo();
  } else {
    console.info(
      "Skipped business-role demo logins; DEMO_BUSINESS_PASSWORD is not configured.",
    );
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  if (!email || !password || !displayName) {
    console.info(
      "Seeded departments, roles, permissions, and Phase 2 data. Bootstrap administrator was not configured.",
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
  await seedPhase3Draft(user.id);
  console.info(`Seeded bootstrap administrator for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
