# ADR-005: Metadata plus storage adapter

**Decision:** Store file metadata in PostgreSQL and bytes in local development or S3-compatible object storage.

**Reason:** Business documents need durable, authorized access without database bloat or public storage paths.

**Alternatives:** Database blobs; provider-specific calls throughout features.

**Consequences:** Downloads require authorization and short-lived access. Production provider, retention, antivirus scanning, and lifecycle rules remain deployment decisions.
