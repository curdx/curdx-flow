import { describe, expect, it } from "vitest";
import {
  recommendToolCapabilities,
  renderCapabilityDecisionTree,
  renderInstalledCapabilityRules,
} from "../../../src/hooks/lib/tool-capabilities.js";
import { runLib } from "./_lib-helpers.js";

describe("tool capability router", () => {
  it("keeps tiny local edits free of third-party tool recommendations", () => {
    const recs = recommendToolCapabilities({
      goal: "Fix README typo",
      route: "direct-change",
      risk: "low",
    });

    expect(recs).toEqual([]);
  });

  it("still recommends Context7 for direct changes that depend on latest official docs", () => {
    const recs = recommendToolCapabilities({
      goal: "Update README with latest Claude Code plugin docs",
      route: "direct-change",
      risk: "low",
    });

    expect(recs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "context7",
          phase: "before-coding",
          availability: "external-expected",
          provisioning: "external-mcp",
        }),
        expect.objectContaining({
          id: "docs-query",
          type: "workflow",
          category: "docs",
        }),
      ]),
    );
  });

  it("marks expected wheels by source without reimplementing them", () => {
    const recs = recommendToolCapabilities({
      goal: "Again debug the same auth failure after multiple failed attempts using latest docs",
      route: "full-spec",
      risk: "high",
      availableCapabilities: ["context7"],
    });

    expect(recs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "claude-mem",
          availability: "plugin-dependency",
          provisioning: "plugin-dependency",
        }),
        expect.objectContaining({
          id: "context7",
          availability: "known-available",
          availabilityState: "available",
          ownedBy: "context7",
          provisioning: "external-mcp",
          doNotReimplement: true,
        }),
        expect.objectContaining({
          id: "sequential-thinking",
          availability: "external-expected",
          provisioning: "external-mcp",
        }),
        expect.objectContaining({
          id: "pua",
          availability: "plugin-dependency",
          provisioning: "plugin-dependency",
        }),
      ]),
    );
    expect(recs.find((rec) => rec.id === "claude-mem")?.availabilityState).toBe("missing");
  });

  it("routes frontend runtime work to UI design and browser verification tools", () => {
    const recs = recommendToolCapabilities({
      goal: "Build a Vue login page and verify the browser interaction",
      route: "lite-spec",
      risk: "medium",
      topologyKinds: ["frontend-app"],
      topologyFrameworks: ["vue"],
      availableCapabilities: ["ui-ux-pro-max", "chrome-devtools-mcp", "context7"],
    });

    expect(recs.map((rec) => rec.id)).toEqual(
      expect.arrayContaining([
        "context7",
        "docs-query",
        "ui-ux-pro-max",
        "chrome-devtools-mcp",
        "browser-verification",
      ]),
    );
    expect(recs.find((rec) => rec.id === "ui-ux-pro-max")?.phase).toBe("implementation");
    expect(recs.find((rec) => rec.id === "chrome-devtools-mcp")?.phase).toBe("verification");
    expect(recs.find((rec) => rec.id === "context7")?.availabilityState).toBe("available");
    expect(recs.find((rec) => rec.id === "ui-ux-pro-max")?.availabilityState).toBe("available");
    expect(recs.find((rec) => rec.id === "chrome-devtools-mcp")?.availabilityState).toBe("available");
  });

  it("routes repeated high-risk backend work to memory, docs, and explicit reasoning", () => {
    const recs = recommendToolCapabilities({
      goal: "Again debug Spring Boot OAuth authorization failure after failed twice using latest official docs",
      route: "full-spec",
      risk: "high",
      topologyKinds: ["backend-service"],
      topologyFrameworks: ["spring-boot"],
      availableCapabilities: [
        "claude-mem",
        "context7",
        "sequential-thinking",
        "pua",
      ],
    });

    expect(recs.map((rec) => rec.id)).toEqual(
      expect.arrayContaining([
        "context7",
        "docs-query",
        "claude-mem",
        "security-review",
        "sequential-thinking",
        "pua",
      ]),
    );
    expect(recs.find((rec) => rec.id === "claude-mem")?.availabilityState).toBe("available");
    expect(recs.find((rec) => rec.id === "context7")?.availabilityState).toBe("available");
    expect(recs.find((rec) => rec.id === "sequential-thinking")?.availabilityState).toBe("available");
    expect(recs.find((rec) => rec.id === "pua")?.availabilityState).toBe("available");
  });

  it("does not recommend tools while missing code roots block the route", () => {
    const recs = recommendToolCapabilities({
      goal: "Update the React login page",
      route: "lite-spec",
      risk: "medium",
      missingRoots: 1,
      availableCapabilities: ["ui-ux-pro-max", "chrome-devtools-mcp"],
    });

    expect(recs).toEqual([]);
  });

  it("renders only installed capability rules", () => {
    const rules = renderInstalledCapabilityRules(["context7", "claude-mem"]);
    const tree = renderCapabilityDecisionTree(["context7", "claude-mem"]);

    expect(rules.join("\n")).toContain("Context7 MCP");
    expect(rules.join("\n")).toContain("/claude-mem:mem-search");
    expect(rules.join("\n")).not.toContain("Chrome DevTools MCP");
    expect(tree.join("\n")).toContain("use the Context7 MCP before editing");
  });

  it("does not treat companion capability names as frontend/browser stack intent", () => {
    const recs = recommendToolCapabilities({
      goal: "Use claude-mem pua context7 sequential-thinking chrome-devtools-mcp ui-ux-pro-max uiuxmax ui ux pro max for better routing",
      route: "lite-spec",
      risk: "medium",
    });

    expect(recs.map((rec) => rec.id)).not.toContain("ui-ux-pro-max");
    expect(recs.map((rec) => rec.id)).not.toContain("chrome-devtools-mcp");
    expect(recs.map((rec) => rec.id)).not.toContain("browser-verification");
  });

  it("CLI emits the same compact JSON recommendations", () => {
    const result = runLib("tool-capabilities", [
      "--goal",
      "Debug React network error in Chrome",
      "--route",
      "full-spec",
      "--risk",
      "high",
      "--available-capabilities",
      "context7,ui-ux-pro-max,chrome-devtools-mcp,sequential-thinking",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "context7" }),
        expect.objectContaining({ id: "ui-ux-pro-max" }),
        expect.objectContaining({ id: "chrome-devtools-mcp" }),
        expect.objectContaining({ id: "sequential-thinking" }),
      ]),
    );
  });
});
