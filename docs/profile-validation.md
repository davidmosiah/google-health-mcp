# Shared profile validation

Profile updates and persisted reads now validate known v1 sections, fields, types
and enums before merging or writing. Valid partial legacy profiles receive
defaults. Unknown fields, wrong types and invalid enums are rejected rather than
coerced. A malformed or unsupported stored file is not replaced with defaults;
repair or restore it explicitly. Errors never include profile values.

This tightens formerly permissive input/read behavior. Existing explicit-intent
gates and secret rejection remain; validation does not prove human authorization.
No profile migration, automatic repair or real-user data access is performed.
Consumer-specific real stdio tests exercise valid patches, denied intent, invalid
patch disk preservation, partial legacy reads, malformed reads and refusal to
overwrite corrupt files, using a fresh synthetic HOME.


Only ENOENT is treated as absence. Other existence/read failures fail closed and
do not trigger defaults, migration or writes. This does not add concurrent-write
locking, file size quotas, or protection against privileged filesystem tampering.
