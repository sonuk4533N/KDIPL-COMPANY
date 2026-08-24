import {
  Bell,
  Boxes,
  CheckSquare2,
  Database,
  FolderKanban,
  LayoutDashboard,
  PackageCheck,
  ReceiptIndianRupee,
  Settings,
  ShoppingCart,
  Warehouse,
} from "lucide-react";

export const primaryNavigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Master data", href: "/master-data", icon: Database },
  { label: "Procurement", href: "/procurement", icon: ShoppingCart },
  { label: "Inventory", href: "/inventory", icon: Warehouse },
  { label: "Accounts", href: "/accounts", icon: ReceiptIndianRupee },
  { label: "Approvals", href: "/approvals", icon: CheckSquare2 },
  { label: "Reports", href: "/reports", icon: Boxes },
  { label: "Notifications", href: "/notifications", icon: Bell },
] as const;

export const administrationNavigation = {
  label: "Administration",
  href: "/administration",
  icon: Settings,
} as const;

export const supervisorMobileNavigation = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Sites", href: "/projects", icon: FolderKanban },
  { label: "Request", href: "/procurement", icon: PackageCheck },
  { label: "Alerts", href: "/notifications", icon: Bell },
  { label: "More", href: "/administration", icon: Settings },
] as const;

export const storeMobileNavigation = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Stock", href: "/inventory", icon: Warehouse },
  { label: "Receive", href: "/inventory", icon: PackageCheck },
  { label: "Issue", href: "/inventory", icon: ShoppingCart },
  { label: "More", href: "/administration", icon: Settings },
] as const;
