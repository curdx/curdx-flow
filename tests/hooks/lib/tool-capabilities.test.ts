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

  it("routes frontend runtime work to UI design and browser verification tools", () => {
    const recs = recommendToolCapabilities({
      goal: "Build a Vue login page and verify the browser interaction",
      route: "lite-spec",
      risk: "medium",
      topologyKinds: ["frontend-app"],
      topologyFrameworks: ["vue"],
      availableCapabilities: ["frontend-design", "chrome-devtools-mcp", "context7"],
    });

    expect(recs.map((rec) => rec.id)).toEqual([
      "context7",
      "frontend-design",
      "chrome-devtools-mcp",
    ]);
    expect(recs.find((rec) => rec.id === "frontend-design")?.phase).toBe("implementation");
    expect(recs.find((rec) => rec.id === "chrome-devtools-mcp")?.phase).toBe("verification");
  });

  it("routes repeated high-risk backend work to memory, docs, and explicit reasoning", () => {
    const recs = recommendToolCapabilities({
      goal: "Again debug Spring Boot OAuth authorization failure using latest official docs",
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

    expect(recs.map((rec) => rec.id)).toEqual([
      "context7",
      "claude-mem",
      "sequential-thinking",
      "pua",
    ]);
  });

  it("does not recommend tools while missing code roots block the route", () => {
    const recs = recommendToolCapabilities({
      goal: "Update the React login page",
      route: "lite-spec",
      risk: "medium",
      missingRoots: 1,
      availableCapabilities: ["frontend-design", "chrome-devtools-mcp"],
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

  it("CLI emits the same compact JSON recommendations", () => {
    const result = runLib("tool-capabilities", [
      "--goal",
      "Debug React network error in Chrome",
      "--route",
      "full-spec",
      "--risk",
      "high",
      "--available-capabilities",
      "context7,frontend-design,chrome-devtools-mcp,sequential-thinking",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "context7" }),
        expect.objectContaining({ id: "frontend-design" }),
        expect.objectContaining({ id: "chrome-devtools-mcp" }),
        expect.objectContaining({ id: "sequential-thinking" }),
      ]),
    );
  });
});
