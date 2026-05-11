import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverProjectTopology,
  renderContextMap,
} from "../../../src/hooks/lib/project-topology.js";
import { makeTmpDir, runLib } from "./_lib-helpers.js";

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2));
}

describe("project-topology detector", () => {
  it("extracts dev code roots from CLAUDE.md and classifies Vue plus Spring Cloud", () => {
    const parent = makeTmpDir("topology-split");
    const backend = path.join(parent, "backend");
    const frontend = path.join(parent, "frontend");
    try {
      mkdirSync(path.join(backend, ".git"), { recursive: true });
      mkdirSync(frontend, { recursive: true });
      writeFileSync(
        path.join(backend, "CLAUDE.md"),
        [
          "# Project",
          "",
          "## Dev",
          "",
          "- frontend: ../frontend",
          "- backend: .",
          "- database: jdbc:mysql://user:password@prod-db:3306/prod",
          "",
        ].join("\n"),
      );
      writeJson(path.join(frontend, "package.json"), {
        dependencies: { vue: "^3.5.0" },
        devDependencies: { vite: "^6.0.0" },
      });
      writeFileSync(
        path.join(backend, "pom.xml"),
        [
          "<project>",
          "<dependency><artifactId>spring-boot-starter-web</artifactId></dependency>",
          "<dependency><artifactId>spring-cloud-starter-gateway</artifactId></dependency>",
          "</project>",
        ].join("\n"),
      );

      const topology = discoverProjectTopology({
        cwd: backend,
        goal: "Update login page API contract",
      });

      const front = topology.roots.find((root) => root.name === "frontend");
      const back = topology.roots.find((root) => root.name === "backend");
      expect(topology.devContextFound).toBe(true);
      expect(front?.kinds).toContain("frontend-app");
      expect(front?.frameworks).toEqual(expect.arrayContaining(["vue", "vite"]));
      expect(back?.kinds).toContain("backend-service");
      expect(back?.frameworks).toEqual(expect.arrayContaining(["spring-boot", "spring-cloud"]));
      expect(topology.missingRoots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "frontend", access: "outside-working-directory" }),
        ]),
      );
      expect(JSON.stringify(topology)).not.toContain("password");
      expect(JSON.stringify(topology)).not.toContain("prod-db");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("treats project additionalDirectories as accessible roots", () => {
    const parent = makeTmpDir("topology-settings");
    const backend = path.join(parent, "backend");
    const frontend = path.join(parent, "frontend");
    try {
      mkdirSync(path.join(backend, ".git"), { recursive: true });
      mkdirSync(path.join(backend, ".claude"), { recursive: true });
      mkdirSync(frontend, { recursive: true });
      writeFileSync(path.join(backend, "CLAUDE.md"), "## Dev\n- frontend: ../frontend\n- backend: .\n");
      writeJson(path.join(frontend, "package.json"), {
        dependencies: { react: "^19.0.0" },
        devDependencies: { vite: "^6.0.0" },
      });
      writeFileSync(
        path.join(backend, ".claude", "settings.json"),
        JSON.stringify({ additionalDirectories: ["../frontend"] }),
      );

      const topology = discoverProjectTopology({
        cwd: backend,
        goal: "Change the React login page",
      });

      expect(topology.missingRoots).toEqual([]);
      expect(topology.requiredRoots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "frontend",
            access: "configured-additional-directory",
          }),
        ]),
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("renders a short context map without leaking database credentials", () => {
    const parent = makeTmpDir("topology-context-map");
    const backend = path.join(parent, "backend");
    try {
      mkdirSync(path.join(backend, ".git"), { recursive: true });
      writeFileSync(
        path.join(backend, "CLAUDE.md"),
        "## Dev\n- backend: .\n- database: postgres://dev:secret@localhost/app\n",
      );
      writeFileSync(path.join(backend, "go.mod"), "module example.com/api\n");

      const map = renderContextMap(discoverProjectTopology({ cwd: backend }));

      expect(map).toContain("backend");
      expect(map).toContain("go");
      expect(map).not.toContain("secret");
      expect(map).not.toContain("postgres://");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("CLI emits JSON topology", () => {
    const cwd = makeTmpDir("topology-cli");
    try {
      mkdirSync(path.join(cwd, ".git"), { recursive: true });
      writeJson(path.join(cwd, "package.json"), {
        bin: "./dist/index.mjs",
      });

      const result = runLib("project-topology", ["--cwd", cwd]);

      expect(result.exitCode).toBe(0);
      expect(result.json).toMatchObject({
        version: 1,
        roots: [expect.objectContaining({ name: "current" })],
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
