import { z } from "zod";
import {
  movementCommands,
  movementKinds,
  nonUsableKinds,
} from "@/server/inventory/customer-movement-policy";

const optionalId = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.uuid().optional(),
);
const decimal = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,3})?$/,
    "Use a non-negative quantity with at most three decimal places.",
  );
const positive = decimal.refine(
  (value) => Number(value) > 0,
  "Quantity must be positive.",
);
const coordinate = (limit: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().finite().min(-limit).max(limit).optional(),
  );
export const gpsSchema = z.object({
  latitude: coordinate(90),
  longitude: coordinate(180),
  capturedAt: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.iso.datetime().optional(),
  ),
});
export const movementCreateSchema = gpsSchema
  .extend({
    kind: z.enum(movementKinds),
    sourceLocationId: z.uuid(),
    destinationLocationId: optionalId,
    materialId: z.uuid(),
    unitId: z.uuid(),
    quantity: decimal,
    reason: z.string().trim().min(3).max(1000),
    evidenceId: optionalId,
    originalIssueId: optionalId,
    correctionOfId: optionalId,
    category: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.enum(nonUsableKinds).optional(),
    ),
    direction: z.enum(["IN", "OUT"]).default("OUT"),
    disposition: z.enum(["DISPOSAL", "SALE"]).default("DISPOSAL"),
  })
  .superRefine((value, context) => {
    const error = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (value.kind !== "COUNT" && !positive.safeParse(value.quantity).success)
      error("quantity", "Quantity must be positive.");
    if (
      ["ISSUE", "TRANSFER", "RETURN"].includes(value.kind) &&
      (!value.destinationLocationId ||
        value.destinationLocationId === value.sourceLocationId)
    )
      error("destinationLocationId", "Select a different destination.");
    if (
      ["ISSUE", "RETURN"].includes(value.kind) &&
      (value.latitude === undefined ||
        value.longitude === undefined ||
        !value.capturedAt)
    )
      error("latitude", "GPS is mandatory for site requests.");
    if (value.kind === "RETURN" && !value.originalIssueId)
      error("originalIssueId", "Select the original acknowledged issue.");
    if (
      ["ADJUSTMENT", "COUNT", "NON_USABLE"].includes(value.kind) &&
      !value.evidenceId
    )
      error("evidenceId", "Clean retained evidence is required.");
    if (value.kind === "NON_USABLE" && !value.category)
      error("category", "Select a non-usable classification.");
    if (value.correctionOfId && value.kind !== "ADJUSTMENT")
      error(
        "correctionOfId",
        "Only adjustments can correct a posted adjustment.",
      );
  });
export const movementTransitionSchema = gpsSchema.extend({
  id: z.uuid(),
  command: z.enum(movementCommands),
  quantity: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    decimal.optional(),
  ),
  reason: z.string().trim().min(3).max(1000),
  evidenceId: optionalId,
});
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;
export type MovementTransitionInput = z.infer<typeof movementTransitionSchema>;
