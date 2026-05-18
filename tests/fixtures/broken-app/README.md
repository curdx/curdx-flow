# Broken App Fixture

This fixture stores controlled failure observations for Epic 5 recovery tests.

The scenarios model a profile-save journey where the backend environment is missing database configuration, downstream API and data checks fail, and browser evidence captures the user-visible symptom. Tests consume these records directly so CI does not depend on a real browser, external MCP server, database, or secret.
