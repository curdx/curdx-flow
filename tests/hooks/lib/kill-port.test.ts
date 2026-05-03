import { describe, it, expect } from "vitest";
import { runLib } from "./_lib-helpers.js";

describe("kill-port", () => {
  it("happy: exit 0 with friendly message when no listeners on chosen port", () => {
    // Port 65535 is the highest valid TCP port; extremely unlikely to be in
    // use during CI. The lib's happy path = "no listeners found, exit 0".
    const r = runLib("kill-port", ["65535"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/no listeners on port 65535|killed \d+\/\d+ pid/);
  });

  it("rejects invalid port values", () => {
    const cases = ["0", "65536", "abc", "-1"];
    for (const bad of cases) {
      const r = runLib("kill-port", [bad]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toMatch(/invalid port/);
    }
  });

  it("usage error when no port arg given", () => {
    const r = runLib("kill-port", []);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/usage: kill-port/);
  });
});
