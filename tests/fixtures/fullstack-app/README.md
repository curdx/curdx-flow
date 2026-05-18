# Fullstack App Fixture

This fixture models the `profile-save` user journey for Story 4.6:

1. Open `/profile`.
2. Fill `input[name="name"]` with `Ada Lovelace`.
3. Click `button[type="submit"]`.
4. Observe `PATCH /api/profile`.
5. Read back `GET /api/profile`.
6. Capture screenshot and trace evidence for the saved UI state.

The fixture is intentionally controlled and local-only. Runtime tests use fake adapters around this journey so CI does not depend on Chrome, external MCP servers, login state, secrets, or a real database.
