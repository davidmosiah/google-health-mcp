# Profile storage boundaries

The canonical shared profile uses a cooperative cross-process lock directory,
`profile.json.lock`, for the entire read/merge/write operation and legacy migration.
Concurrent updates to distinct fields are serialized. Readers of an existing file
see an atomic old or new document. All participating writers must run this protocol;
older connectors or external editors do not honor the lock. This does not merge
conflicting edits to the same field or coordinate arbitrary filesystem attackers.
Use a local filesystem with atomic mkdir/rename semantics, not an unverified network
filesystem.

Lock acquisition waits up to five seconds then fails without changing the profile.
Locks are never stolen based on age, timestamps or PID reuse. A crash can leave an
abandoned lock: stop every profile writer, verify that none is still using it, then
remove only the empty `profile.json.lock` directory and retry. Never remove a lock
while a connector may be active. There is no automatic stale-lock recovery.

Profile JSON input files and serialized output are limited to 256 KiB of UTF-8 bytes.
This includes whitespace and metadata. Reads use a fixed limit-plus-one buffer and
check actual bytes, not only an initial stat; the profile must be a regular file.
Invalid UTF-8 and symlinks (where no-follow is supported) are rejected. Over-quota
profiles require explicit shortening/restoration; they are not overwritten with
defaults. The quota is not a total process-memory guarantee for tool input already
parsed by the transport. Existing v1 field validation and secret rejection remain.

Writes use an exclusively created random temporary file, mode 0600, file sync and
atomic rename. Newly created parent/lock directories request mode 0700; pre-existing
directory permissions are not modified. A crash can leave a temporary file, but
never commits a partial JSON document. Directory fsync/power-loss durability and
adversarial symlink/parent-directory replacement are not claimed.

Synthetic tests cover cooperating processes, migration/update races, quota rejection
without disk mutation, abandoned lock refusal, cleanup after exceptions and mode
checks. No real profile, account or provider network is used.

Checking an absent canonical profile may now create its private parent directory
and briefly acquire a lock while checking legacy migration. Access failures other
than ENOENT fail closed without falling back to a legacy file. Filesystem errors
are reported without exposing local paths or file contents.

Canonical and legacy profile entries must not be symbolic links, including dangling
links. Presence checks use lstat and fail closed without replacing the link,
following it, creating a target, or falling back to another profile. Only ENOENT
means absent. This protects cooperative local file handling, not races caused by
a malicious process replacing paths or parent directories.
