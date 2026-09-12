import "server-only";

export type FileScanResult = {
  status: "CLEAN" | "REJECTED";
  provider: "LOCAL_SIGNATURE_SCANNER";
  reference: string;
};

const blockedSignatures = [
  "EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
  "<script language="VBScript">",
  "powershell -encodedcommand",
];

export function scanFileLocally(bytes: Uint8Array): FileScanResult {
  const sample = Buffer.from(bytes).toString("latin1").toLowerCase();
  const match = blockedSignatures.find((signature) =>
    sample.includes(signature.toLowerCase()),
  );
  return match
    ? {
        status: "REJECTED",
        provider: "LOCAL_SIGNATURE_SCANNER",
        reference: "BLOCKED_SIGNATURE",
      }
    : {
        status: "CLEAN",
        provider: "LOCAL_SIGNATURE_SCANNER",
        reference: "NO_BLOCKED_SIGNATURE",
      };
}

export function retentionUntilForEightFinancialYears(uploadedAt: Date) {
  const financialYearEnd =
    uploadedAt.getUTCMonth() >= 3
      ? new Date(Date.UTC(uploadedAt.getUTCFullYear() + 1, 2, 31))
      : new Date(Date.UTC(uploadedAt.getUTCFullYear(), 2, 31));
  financialYearEnd.setUTCFullYear(financialYearEnd.getUTCFullYear() + 8);
  return financialYearEnd;
}
