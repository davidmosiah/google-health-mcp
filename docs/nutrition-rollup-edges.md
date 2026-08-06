# Nutrition rollup edge cases

Document empty days, partial macros, and timezone boundaries in nutrition rollups.
Tests cover normalize paths; agents should treat EMPTY as no data, not zero calories assumed.
