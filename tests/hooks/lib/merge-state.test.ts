import { describe, it, expect } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runLib, makeTmpDir } from "./_lib-helpers.js";

describe("merge-state", () => {
  it("happy: deep-merges a JSON patch into existing state", () => {
    const dir = makeTmpDir("merge");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(
      stateFile,
      JSON.stringify({ a: 1, nested: { x: 10, keep: "yes" } }),
    );
    try {
      const r = runLib("merge-state", [
        stateFile,
        '{"b":2,"nested":{"y":20}}',
      ]);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after).toEqual({
        a: 1,
        b: 2,
        nested: { x: 10, keep: "yes", y: 20 },
      });
      // stdout echoes merged JSON
      expect(JSON.parse(r.stdout)).toEqual(after);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("happy: missing state file is treated as {}", () => {
    const dir = makeTmpDir("merge-missing");
    const stateFile = path.join(dir, "state.json"); // intentionally not created
    try {
      const r = runLib("merge-state", [stateFile, '{"hello":"world"}']);
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({
        hello: "world",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("arrays replace whole (do not merge element-wise)", () => {
    const dir = makeTmpDir("merge-array");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ list: [1, 2, 3] }));
    try {
      const r = runLib("merge-state", [stateFile, '{"list":[9]}']);
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({
        list: [9],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // U-1: basic $unset removes key from base
  it("$unset: removes a single root-level key from existing state (U-1)", () => {
    const dir = makeTmpDir("merge-unset-basic");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(
      stateFile,
      JSON.stringify({ completed: true, completedAt: "2026-05-04T13:00:00.000Z" }),
    );
    try {
      const r = runLib("merge-state", [stateFile, '{"$unset":["completedAt"]}']);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after).toEqual({ completed: true });
      expect("completedAt" in after).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // U-2: $unset combined with normal patch fields (deepMerge then delete)
  it("$unset: applies normal patch first, then deletes listed keys (U-2)", () => {
    const dir = makeTmpDir("merge-unset-combined");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(
      stateFile,
      JSON.stringify({ completed: true, completedAt: "2026-05-04T13:00:00.000Z" }),
    );
    try {
      const r = runLib("merge-state", [
        stateFile,
        '{"completed":false,"$unset":["completedAt"]}',
      ]);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after).toEqual({ completed: false });
      expect("completedAt" in after).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // U-3: $unset of a missing key is a silent no-op
  it("$unset: deleting a non-existent key is a silent no-op (U-3)", () => {
    const dir = makeTmpDir("merge-unset-missing");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ a: 1 }));
    try {
      const r = runLib("merge-state", [stateFile, '{"$unset":["nonexistent"]}']);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toBe("");
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({ a: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // U-4: $unset must be a string[] — non-array value exits 1 with stderr
  it("$unset: non-array value exits 1 with stderr message (U-4)", () => {
    const dir = makeTmpDir("merge-unset-invalid");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ a: 1 }));
    try {
      const r = runLib("merge-state", [
        stateFile,
        '{"$unset":"not-an-array"}',
      ]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("$unset must be string[]");
      // base file untouched on failure
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({ a: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // U-5: patch with no $unset key is fully transparent (backwards-compat)
  it("$unset: absent key leaves existing deepMerge behavior unchanged (U-5)", () => {
    const dir = makeTmpDir("merge-unset-absent");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ b: 2 }));
    try {
      const r = runLib("merge-state", [stateFile, '{"a":1}']);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after).toEqual({ a: 1, b: 2 });
      // ensure no $unset leakage into stored state
      expect("$unset" in after).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // U-6: empty $unset array is a no-op
  it("$unset: empty array is a no-op (U-6)", () => {
    const dir = makeTmpDir("merge-unset-empty");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ a: 1 }));
    try {
      const r = runLib("merge-state", [stateFile, '{"$unset":[]}']);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after).toEqual({ a: 1 });
      expect("$unset" in after).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // VB-1: atomic write of full verificationBlocks object reads back correctly
  it("verificationBlocks: atomic write of full object reads back correctly (VB-1)", () => {
    const dir = makeTmpDir("merge-vb-write");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ specName: "demo" }));
    try {
      const patch = {
        verificationBlocks: {
          research: {
            command: "npm run research:verify",
            exitCode: 0,
            timestamp: "2026-05-06T12:00:00.000Z",
            srcMtime: 1714994400000,
          },
          design: {
            command: "npm run design:verify",
            exitCode: 0,
            timestamp: "2026-05-06T12:05:00.000Z",
            srcMtime: 1714994700000,
          },
        },
      };
      const r = runLib("merge-state", [stateFile, JSON.stringify(patch)]);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as Record<
        string,
        unknown
      >;
      expect(after).toEqual({
        specName: "demo",
        verificationBlocks: patch.verificationBlocks,
      });
      // stdout echoes merged JSON
      expect(JSON.parse(r.stdout)).toEqual(after);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // VB-2: $unset of a single phase removes only that phase, siblings preserved
  it("verificationBlocks: $unset removes single phase, siblings preserved (VB-2)", () => {
    const dir = makeTmpDir("merge-vb-unset-phase");
    const stateFile = path.join(dir, "state.json");
    const initial = {
      verificationBlocks: {
        research: {
          command: "npm run research:verify",
          exitCode: 0,
          timestamp: "2026-05-06T12:00:00.000Z",
          srcMtime: 1714994400000,
        },
        design: {
          command: "npm run design:verify",
          exitCode: 0,
          timestamp: "2026-05-06T12:05:00.000Z",
          srcMtime: 1714994700000,
        },
        tasks: {
          command: "npm run tasks:verify",
          exitCode: 0,
          timestamp: "2026-05-06T12:10:00.000Z",
          srcMtime: 1714995000000,
        },
      },
    };
    writeFileSync(stateFile, JSON.stringify(initial));
    try {
      const r = runLib("merge-state", [
        stateFile,
        '{"$unset":["verificationBlocks.research"]}',
      ]);
      expect(r.exitCode).toBe(0);
      const after = JSON.parse(readFileSync(stateFile, "utf8")) as {
        verificationBlocks: Record<string, unknown>;
      };
      expect("research" in after.verificationBlocks).toBe(false);
      expect(after.verificationBlocks).toEqual({
        design: initial.verificationBlocks.design,
        tasks: initial.verificationBlocks.tasks,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // VB-3: writing a block missing required field `command` errors with readable message
  it("verificationBlocks: missing required field command errors with readable message (VB-3)", () => {
    const dir = makeTmpDir("merge-vb-invalid");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(stateFile, JSON.stringify({ specName: "demo" }));
    try {
      // research block is missing the required `command` field
      const patch = {
        verificationBlocks: {
          research: {
            exitCode: 0,
            timestamp: "2026-05-06T12:00:00.000Z",
            srcMtime: 1714994400000,
          },
        },
      };
      const r = runLib("merge-state", [stateFile, JSON.stringify(patch)]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("verificationBlocks.research");
      expect(r.stderr).toContain("command");
      // base file untouched on validation failure
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({
        specName: "demo",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("completion: quick/lite specs require a passing execution verification block", () => {
    const dir = makeTmpDir("merge-completion-vb-required");
    const stateFile = path.join(dir, "state.json");
    writeFileSync(
      stateFile,
      JSON.stringify({
        quickMode: true,
        autoPolicy: { executionMode: "spec-lite" },
      }),
    );
    try {
      const r = runLib("merge-state", [stateFile, '{"completed":true}']);
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("verificationBlocks.execution");
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({
        quickMode: true,
        autoPolicy: { executionMode: "spec-lite" },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("completion: quick/lite specs can complete after passing execution verification", () => {
    const dir = makeTmpDir("merge-completion-vb-pass");
    const stateFile = path.join(dir, "state.json");
    const execution = {
      command: "npm test",
      exitCode: 0,
      timestamp: "2026-05-06T12:00:00.000Z",
      srcMtime: 1714994400000,
    };
    writeFileSync(
      stateFile,
      JSON.stringify({
        route: { route: "lite-spec" },
        verificationBlocks: { execution },
      }),
    );
    try {
      const r = runLib("merge-state", [stateFile, '{"completed":true}']);
      expect(r.exitCode).toBe(0);
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual({
        route: { route: "lite-spec" },
        verificationBlocks: { execution },
        completed: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
