import { describe, expect, it } from "vitest";

import {
  retentionUntilForEightFinancialYears,
  scanFileLocally,
} from "../../src/server/storage/file-security";

describe("Phase 5 evidence security", () => {
  it("rejects the standard antivirus test signature", () => {
    const result = scanFileLocally(
      new TextEncoder().encode(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
      ),
    );
    expect(result.status).toBe("REJECTED");
    expect(result.reference).toBe("BLOCKED_SIGNATURE");
  });

  it("accepts content without a blocked local signature", () => {
    const result = scanFileLocally(
      new TextEncoder().encode("KDIPL delivery challan"),
    );
    expect(result).toMatchObject({
      status: "CLEAN",
      provider: "LOCAL_SIGNATURE_SCANNER",
    });
  });

  it("retains evidence through eight financial-year ends", () => {
    expect(
      retentionUntilForEightFinancialYears(
        new Date("2026-09-12T00:00:00.000Z"),
      )
        .toISOString()
        .slice(0, 10),
    ).toBe("2035-03-31");
    expect(
      retentionUntilForEightFinancialYears(
        new Date("2026-02-10T00:00:00.000Z"),
      )
        .toISOString()
        .slice(0, 10),
    ).toBe("2034-03-31");
  });
});
