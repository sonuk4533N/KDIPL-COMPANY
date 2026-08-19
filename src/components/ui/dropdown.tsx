"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "@/lib/cn";

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({
  className,
  children,
  align = "end",
}: {
  className?: string;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn(
          "z-50 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-lg",
          className,
        )}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  className,
  ...props
}: DropdownPrimitive.DropdownMenuItemProps) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-lg px-3 py-2 text-slate-700 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownSeparator = (
  props: DropdownPrimitive.DropdownMenuSeparatorProps,
) => (
  <DropdownPrimitive.Separator className="my-1 h-px bg-slate-100" {...props} />
);
