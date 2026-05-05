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
});
