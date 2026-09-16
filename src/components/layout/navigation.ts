import {
  Bell,
  Boxes,
  CheckSquare2,
  ClipboardList,
  Database,
  FolderKanban,
  LayoutDashboard,
  PackageCheck,
  ReceiptIndianRupee,
  Settings,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import type { PermissionCode } from "@/types/application";

export const primaryNavigation = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissions: ["app.access"],
  },
  {
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
    permissions: ["project.view"],
  },
  {
    label: "Requirements",
    href: "/requirements",
    icon: ClipboardList,
    permissions: ["material_requirement.view"],
  },
  {
    label: "Master data",
    href: "/master-data",
    icon: Database,
    permissions: ["catalog.view", "supplier.view"],
  },
  {
    label: "Procurement",
    href: "/procurement",
    icon: ShoppingCart,
    permissions: ["purchase.view"],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Warehouse,
    permissions: ["inventory.view"],
  },
  {
    label: "Accounts",
    href: "/accounts",
    icon: ReceiptIndianRupee,
    permissions: ["invoice.view"],
  },
  {
    label: "Approvals",
    href: "/approvals",
    icon: CheckSquare2,
    permissions: [
      "material_requirement.approve",
      "purchase.approve",
      "invoice.approve",
      "payment.approve",
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: Boxes,
    permissions: ["report.view"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    permissions: ["notification.view"],
  },
] as const;

export const administrationNavigation = {
  label: "Administration",
  href: "/administration",
  icon: Settings,
} as const;

export const supervisorMobileNavigation = [
  {
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissions: ["app.access"],
  },
  {
    label: "Sites",
    href: "/projects",
    icon: FolderKanban,
    permissions: ["project.view"],
  },
  {
    label: "Request",
    href: "/requirements",
    icon: PackageCheck,
    permissions: ["material_requirement.view"],
  },
  {
    label: "Stock",
    href: "/inventory",
    icon: Warehouse,
    permissions: ["inventory.view"],
  },
] as const;

export const storeMobileNavigation = [
  {
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissions: ["app.access"],
  },
  {
    label: "Stock",
    href: "/inventory",
    icon: Warehouse,
    permissions: ["inventory.view"],
  },
  {
    label: "Receive",
    href: "/inventory",
    icon: PackageCheck,
    permissions: ["inventory.receive"],
  },
] as const;

export function canAccessNavigationItem(
  item: { permissions: readonly PermissionCode[] },
  permissions: readonly PermissionCode[],
) {
  return item.permissions.some((permission) =>
    permissions.includes(permission),
  );
}
