# Legacy incomplete booking-idempotency patch

The quarantined KUP worktree contained an uncommitted migration adding request ID and request fingerprint columns plus insert-column wiring.

It was not imported because it did not implement request ID transport, fingerprint validation, replay of prior success, conflict handling, or concurrency tests. Importing only the schema would create false assurance.

Implement idempotency later as a complete standalone feature with an explicit API contract and retry tests.
