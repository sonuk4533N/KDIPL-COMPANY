# Phase 11A — Production Environment Configuration

## 1. Hosting Architecture & Region Topology

- **Region:** India Cloud Region (`ap-south-1` AWS Mumbai / GCP `asia-south1`).
- **VPC Isolation:** Staging and Production operate in strictly separate Virtual Private Clouds with no peering or shared credentials.
- **Domain & SSL:** `erp.kdipl.in` served through HTTPS with TLS 1.3 enforced, HSTS (Strict-Transport-Security: `max-age=31536000; includeSubDomains; preload`), and CAA DNS records restricting certificate issuance.

---

## 2. PostgreSQL 16+ Production Configuration

- **Managed Database:** AWS RDS PostgreSQL / GCP Cloud SQL for PostgreSQL (Multi-AZ deployment with synchronous standby).
- **Storage Encryption:** AWS KMS / GCP Cloud KMS customer-managed key (`AES-256`).
- **Connection Security:** Enforced TLS (`sslmode=verify-full`).
- **Connection Pooling:**
  - Application-side connection pooling managed via Prisma with `@prisma/adapter-pg`.
  - Dedicated connection pooler (`PgBouncer`) configured between Next.js server instances and PostgreSQL:
    - `pool_mode = transaction`
    - `max_client_conn = 500`
    - `default_pool_size = 25`
    - `reserve_pool_size = 5`

---

## 3. Production Secrets & Environment Management

Production credentials are never committed to Git or CI fixtures. They are injected at runtime via AWS Secrets Manager or GCP Secret Manager.

### Environment Variable Specification (`.env.production`)

```ini
# Application Identity & URLs
NODE_ENV="production"
APP_URL="https://erp.kdipl.in"
RELEASE_SHA="<40-character git commit sha>"

# Database Configuration (Multi-AZ with TLS verify-full)
DATABASE_URL="postgresql://kdipl_app:<SECURE_PASSWORD>@db.internal:5432/kdipl_production?sslmode=verify-full"

# Authentication & Session Security (Minimum 32 random bytes)
AUTH_SECRET="<high-entropy-64-char-random-secret>"
SESSION_ABSOLUTE_HOURS="12"
SESSION_IDLE_MINUTES="120"
AUTH_RATE_LIMIT_ATTEMPTS="5"
AUTH_RATE_LIMIT_WINDOW_MINUTES="15"

# Object Storage (Durable S3 in India Region)
FILE_STORAGE_PROVIDER="s3"
FILE_STORAGE_BUCKET="kdipl-production-documents"
FILE_STORAGE_REGION="ap-south-1"
FILE_STORAGE_MAX_BYTES="52428800"
FILE_STORAGE_FORCE_PATH_STYLE="false"
# Workload Identity / IAM Roles preferred; if keys required:
FILE_STORAGE_ACCESS_KEY_ID="<PRODUCTION_IAM_ACCESS_KEY>"
FILE_STORAGE_SECRET_ACCESS_KEY="<PRODUCTION_IAM_SECRET_KEY>"

# Enterprise Malware Scanner
FILE_SCANNER_PROVIDER="clamav"
FILE_SCANNER_ENDPOINT="https://scanner.internal:9000/scan"
FILE_SCANNER_API_KEY="<SCANNER_GATEWAY_TOKEN>"

# Logging & Observability
LOG_LEVEL="info"
```

---

## 4. Object & Document Storage Security

- **Bucket Settings:** Public Access Block is enabled; S3 bucket policy denies all non-HTTPS (`aws:SecureTransport: false`) traffic.
- **Server-Side Encryption:** SSE-KMS enabled with annual key rotation.
- **Lifecycle & Retention:** Object versioning enabled to prevent accidental document loss. Lifecycle rules transition documents older than 3 financial years to Glacier Instant Retrieval while maintaining availability for the statutory 8-year retention requirement.
- **Download Links:** Presigned S3 URLs expire strictly after 24 hours.
