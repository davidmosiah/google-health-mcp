# coverage --live retry / rate-limit honesty

When live coverage hits rate limits or transient errors:

- Report RATE/retryable failure per data type
- Do not mark types as "covered" on failed reads
- Do not invent point counts
