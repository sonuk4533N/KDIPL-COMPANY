// Customer-aligned Phase 6 policy. Deliberately independent of the superseded
// Phase 6 consumption and Project-Director adjustment approval rules.
export const movementKinds = [
  "ISSUE",
  "TRANSFER",
  "RETURN",
  "ADJUSTMENT",
  "COUNT",
  "NON_USABLE",
] as const;
export type MovementKind = (typeof movementKinds)[number];
export const nonUsableKinds = [
  "NORMAL_WASTAGE",
  "DAMAGE",
  "THEFT_LOSS",
  "BREAKAGE",
  "SCRAP",
  "OBSOLETE",
] as const;
export const movementCommands = [
  "APPROVE_EXTRA",
  "APPROVE",
  "REJECT",
  "DISPATCH",
  "ISSUE",
  "ACKNOWLEDGE",
  "RECEIVE",
  "VERIFY_RETURN",
  "VERIFY_COUNT",
  "POST",
  "CANCEL",
] as const;
export type MovementCommand = (typeof movementCommands)[number];

export function financialYear(date: Date): number {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date.");
  // India has no daylight-saving changes. Sequence rollover is midnight IST.
  const india = new Date(date.getTime() + 330 * 60_000);
  return india.getUTCFullYear() - (india.getUTCMonth() < 3 ? 1 : 0);
}

export function financialYearNumber(
  prefix: string,
  year: number,
  value: bigint,
) {
  if (
    !/^[A-Z]{2,5}$/.test(prefix) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2098 ||
    value < BigInt(1)
  ) {
    throw new Error("Invalid financial-year sequence.");
  }
  return `${prefix}-${String(year % 100).padStart(2, "0")}-${String((year + 1) % 100).padStart(2, "0")}-${value.toString().padStart(4, "0")}`;
}

export function movementPrefix(kind: MovementKind) {
  return {
    ISSUE: "MI",
    TRANSFER: "TRF",
    RETURN: "RET",
    ADJUSTMENT: "ADJ",
    COUNT: "COUNT",
    NON_USABLE: "NU",
  }[kind];
}

export function requiredMovementRole(
  kind: MovementKind,
  command: MovementCommand,
  siteReceipt = false,
) {
  if (command === "APPROVE_EXTRA") return "PROJECT_MANAGER";
  if (command === "APPROVE" || command === "REJECT")
    return kind === "TRANSFER" ? "PROJECT_DIRECTOR" : "MANAGING_DIRECTOR";
  if (command === "ACKNOWLEDGE" || (command === "RECEIVE" && siteReceipt))
    return "SITE_SUPERVISOR";
  if (command === "VERIFY_COUNT") return "ACCOUNTS";
  if (command === "CANCEL" && (kind === "ISSUE" || kind === "RETURN"))
    return "SITE_SUPERVISOR";
  return "STORE_KEEPER";
}

export function nextMovementState(
  kind: MovementKind,
  state: string,
  command: MovementCommand,
): string {
  if (command === "CANCEL" && state === "REQUESTED") return "CANCELLED";
  if (command === "APPROVE_EXTRA" && kind === "ISSUE" && state === "REQUESTED")
    return state;
  if (
    ["TRANSFER", "ADJUSTMENT", "NON_USABLE"].includes(kind) &&
    state === "REQUESTED"
  ) {
    if (command === "APPROVE") return "APPROVED";
    if (command === "REJECT") return "REJECTED";
  }
  const edges: Partial<Record<MovementKind, Record<string, string>>> = {
    ISSUE: {
      "REQUESTED:ISSUE": "ISSUED",
      "ISSUED:ACKNOWLEDGE": "ACKNOWLEDGED",
    },
    TRANSFER: {
      "APPROVED:DISPATCH": "DISPATCHED",
      "DISPATCHED:RECEIVE": "RECEIVED",
    },
    RETURN: { "REQUESTED:VERIFY_RETURN": "POSTED" },
    ADJUSTMENT: { "APPROVED:POST": "POSTED" },
    NON_USABLE: { "APPROVED:POST": "POSTED" },
    COUNT: { "REQUESTED:VERIFY_COUNT": "VERIFIED" },
  };
  const next = edges[kind]?.[`${state}:${command}`];
  if (!next)
    throw new Error("This transition is not allowed from the current state.");
  return next;
}
