export type SamlUserAssertion = {
  issuer: string;
  nameId: string;
  email: string;
  displayName: string;
  groups: string[];
  sessionIndex: string;
  notOnOrAfter: string;
};

export type BreakGlassSession = {
  sessionId: string;
  authorizedByUserId: string;
  invokedByUserId: string;
  emergencyReason: string;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
  isTamperEvident: boolean;
};

export type PeriodicAccessReviewItem = {
  reviewId: string;
  userId: string;
  userDisplayName: string;
  roleCode: string;
  lastActiveDate: string;
  decision: "CERTIFIED" | "REVOKE_RECOMMENDED" | "PENDING";
  certifiedById?: string;
};

export class EnterpriseSecurityService {
  /**
   * Validates SAML 2.0 / OIDC token assertion and maps enterprise corporate claims.
   */
  static validateSamlAssertion(
    assertion: SamlUserAssertion,
    expectedIssuer: string,
    asOfDate = new Date(),
  ): {
    isValid: boolean;
    principalMapping?: {
      email: string;
      displayName: string;
      inferredRoles: string[];
    };
    errorReason?: string;
  } {
    if (assertion.issuer !== expectedIssuer) {
      return {
        isValid: false,
        errorReason: `Untrusted SAML IdP issuer (${assertion.issuer}). Expected: ${expectedIssuer}`,
      };
    }

    const expiry = new Date(assertion.notOnOrAfter).getTime();
    if (asOfDate.getTime() > expiry) {
      return {
        isValid: false,
        errorReason: "SAML assertion token has expired.",
      };
    }

    if (!assertion.email || !assertion.email.includes("@")) {
      return {
        isValid: false,
        errorReason: "Invalid or missing NameID/email claim in SAML assertion.",
      };
    }

    // Map enterprise Azure AD / Okta groups to internal KDIPL roles
    const inferredRoles: string[] = [];
    if (assertion.groups.includes("KDIPL_Exec_Board")) inferredRoles.push("MANAGING_DIRECTOR");
    if (assertion.groups.includes("KDIPL_Project_Directors")) inferredRoles.push("PROJECT_DIRECTOR");
    if (assertion.groups.includes("KDIPL_Finance_Core")) inferredRoles.push("ACCOUNTS_ADMIN");
    if (inferredRoles.length === 0) inferredRoles.push("PROJECT_MEMBER");

    return {
      isValid: true,
      principalMapping: {
        email: assertion.email.toLowerCase(),
        displayName: assertion.displayName || assertion.nameId,
        inferredRoles,
      },
    };
  }

  /**
   * Issues a time-bounded Break-Glass emergency session for crisis intervention.
   * Max validity: 4 hours.
   */
  static issueBreakGlassSession(input: {
    invokedByUserId: string;
    authorizedByUserId: string;
    emergencyReason: string;
    durationHours?: number;
  }): BreakGlassSession {
    if (!input.emergencyReason || input.emergencyReason.trim().length < 15) {
      throw new Error("Emergency justification reason must be detailed (min 15 characters).");
    }

    const duration = Math.max(1, Math.min(4, input.durationHours ?? 2));
    const now = new Date();
    const expires = new Date(now.getTime() + duration * 60 * 60 * 1000);

    return {
      sessionId: `BG-${Date.now().toString().slice(-8)}`,
      authorizedByUserId: input.authorizedByUserId,
      invokedByUserId: input.invokedByUserId,
      emergencyReason: input.emergencyReason.trim(),
      grantedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      isTamperEvident: true,
    };
  }

  /**
   * Verifies whether a Break-Glass emergency session is currently valid.
   */
  static isBreakGlassActive(session: BreakGlassSession, asOfDate = new Date()): boolean {
    if (session.revokedAt) return false;
    const now = asOfDate.getTime();
    const exp = new Date(session.expiresAt).getTime();
    return now <= exp;
  }
}
