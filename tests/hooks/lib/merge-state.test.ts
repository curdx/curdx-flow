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
});
