# ADR-005: Metadata, quarantine, and storage adapter

**Decision:** Store immutable file metadata and scan state in PostgreSQL and bytes in local development or S3-compatible object storage. New evidence remains quarantined until local signature scanning succeeds.

**Reason:** Business documents need durable, authorized access without database bloat or public storage paths. Executable extensions, executable MIME types, executable file signatures, and known blocked signatures are rejected. Clean GRN evidence is retained through eight financial-year ends, and authorized links expire after 24 hours.

**Alternatives:** Database blobs; provider-specific calls throughout features; automatic transmission to an unnamed external antivirus service.

**Consequences:** Production may replace the local signature scanner only with a specifically approved antivirus provider and data destination. Scanner failure must remain fail-closed, and finalized file records cannot be deleted or have retention shortened.
