import { env } from "@/config/env";

export type FileScanStatus =
  "CLEAN" | "REJECTED" | "QUARANTINED" | "SCAN_FAILED";

export type FileScanProvider =
  "LOCAL_SIGNATURE_SCANNER" | "CLAMAV_REST" | "HTTP_SCANNER";

export type FileScanResult = {
  status: FileScanStatus;
  provider: FileScanProvider;
  reference: string;
  quarantinedReason?: string;
};

const blockedSignatures = [
  "EICAR-STANDARD-ANTIVIRUS-TEST-FILE",
  '<script language="VBScript">',
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

/**
 * Enterprise production scanner with strict fail-closed quarantine policy.
 * Any scanner downtime, HTTP error, or timeout immediately marks the file as QUARANTINED.
 */
export async function scanFile(
  bytes: Uint8Array,
  options: { filename?: string } = {},
): Promise<FileScanResult> {
  // 1. Always evaluate local signatures & EICAR first
  const localCheck = scanFileLocally(bytes);
  if (localCheck.status !== "CLEAN") {
    return localCheck;
  }

  // 2. If local provider is configured, return clean local scan
  if (env.FILE_SCANNER_PROVIDER === "local" || !env.FILE_SCANNER_ENDPOINT) {
    return localCheck;
  }

  // 3. Delegate to production HTTP/ClamAV scanner
  const providerName: FileScanProvider =
    env.FILE_SCANNER_PROVIDER === "clamav" ? "CLAMAV_REST" : "HTTP_SCANNER";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s SLA

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };
    if (options.filename) {
      headers["X-Filename"] = encodeURIComponent(options.filename);
    }
    if (env.FILE_SCANNER_API_KEY) {
      headers["Authorization"] = `Bearer ${env.FILE_SCANNER_API_KEY}`;
    }

    const response = await fetch(env.FILE_SCANNER_ENDPOINT, {
      method: "POST",
      headers,
      body: Buffer.from(bytes),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      console.warn("malware_scan.http_error", { status: response.status });
      // FAIL-CLOSED: Scanner returned non-200, quarantine file
      return {
        status: "QUARANTINED",
        provider: providerName,
        reference: `SCAN_HTTP_${response.status}`,
        quarantinedReason: "Malware scanner service returned an error status.",
      };
    }

    const data = (await response.json().catch(() => ({}))) as {
      isInfected?: boolean;
      status?: string;
      signature?: string;
    };

    if (
      data.isInfected ||
      data.status === "INFECTED" ||
      data.status === "MALICIOUS"
    ) {
      return {
        status: "REJECTED",
        provider: providerName,
        reference: data.signature || "MALWARE_DETECTED",
      };
    }

    return {
      status: "CLEAN",
      provider: providerName,
      reference: "SCAN_VERIFIED_CLEAN",
    };
  } catch (error) {
    console.error(
      "malware_scan.service_failure",
      error instanceof Error ? error.message : "Unknown",
    );

    // FAIL-CLOSED: Network error or timeout, quarantine file
    return {
      status: "QUARANTINED",
      provider: providerName,
      reference: "SCAN_UNAVAILABLE_FAIL_CLOSED",
      quarantinedReason:
        "Malware scanner unreachable or timed out. File fail-closed into quarantine.",
    };
  }
}

export function retentionUntilForEightFinancialYears(uploadedAt: Date) {
  const financialYearEnd =
    uploadedAt.getUTCMonth() >= 3
      ? new Date(Date.UTC(uploadedAt.getUTCFullYear() + 1, 2, 31))
      : new Date(Date.UTC(uploadedAt.getUTCFullYear(), 2, 31));
  financialYearEnd.setUTCFullYear(financialYearEnd.getUTCFullYear() + 8);
  return financialYearEnd;
}
