// src/hooks/lib/runtime-cli.ts
//
// Plugin-local command surface exposed via plugins/curdx-flow/bin/curdx-flow.
// Keep this wrapper small: it normalizes command names and delegates to the
// same TypeScript helpers that hooks and tests use.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySmartRoute } from "./smart-route.js";
import { buildWorkflowSnapshot } from "./workflow-snapshot.js";
import { runVerificationCheck } from "./check-verification-blocks.js";
import {
  findSpec,
  getDefaultDir,
  getSpecsDirs,
  listSpecs,
  resolveCurrent,
} from "../_shared/path-resolver.js";

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function usage(exitCode = 1): never {
  const text = [
    "usage: curdx-flow <command> [args]",
    "",
    "commands:",
    "  route --goal <text> [--name <spec>] [--flags <args>] [--cwd <dir>]",
    "  snapshot [--spec <name-or-path>] [--goal <text>] [--cwd <dir>]",
    "  specs dirs [--cwd <dir>]",
    "  specs list [--cwd <dir>]",
    "  specs find <name> [--cwd <dir>]",
    "  specs resolve [name-or-path] [--cwd <dir>]",
    "  state merge <state-file> <json-patch>",
    "  tasks count <tasks.md>",
    "  verify-blocks [--cwd <dir>] [--spec <name-or-path>]",
    "  doctor [--cwd <dir>]",
  ].join("\n");
  process.stderr.write(text + "\n");
  process.exit(exitCode);
}

function scriptRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function runBundled(scriptName: string, args: string[], cwd?: string): never {
  const script = join(scriptRoot(), `${scriptName}.mjs`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(`${scriptName}: ${(result.error as Error).message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function route(argv: string[]): void {
  const estimatedRaw = readArg("--estimated-files", argv);
  const taskRaw = readArg("--task-count", argv);
  printJson(
    classifySmartRoute({
      goal: readArg("--goal", argv) ?? "",
      name: readArg("--name", argv),
      flags: readArg("--flags", argv) ?? "",
      cwd: readArg("--cwd", argv),
      changedFiles: parseList(readArg("--files", argv)),
      availableCapabilities: parseList(readArg("--available-capabilities", argv)),
      estimatedFiles: estimatedRaw === undefined ? undefined : Number(estimatedRaw),
      taskCount: taskRaw === undefined ? undefined : Number(taskRaw),
    }),
  );
}

function snapshot(argv: string[]): void {
  printJson(
    buildWorkflowSnapshot({
      cwd: readArg("--cwd", argv),
      spec: readArg("--spec", argv),
      goal: readArg("--goal", argv),
    }),
  );
}

function firstPositional(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value) continue;
    if (value.startsWith("--")) {
      i += 1;
      continue;
    }
    return value;
  }
  return undefined;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveSpecPathForOutput(cwd: string, path: string): { path: string; fsPath: string } {
  const fsPath = isAbsolute(path) ? path : join(cwd, path);
  return { path, fsPath };
}

function specs(argv: string[]): void {
  const [sub, ...rest] = argv;
  const cwd = resolve(readArg("--cwd", rest) ?? process.cwd());

  if (sub === "dirs") {
    printJson({
      defaultDir: getDefaultDir({ cwd }),
      dirs: getSpecsDirs({ cwd }),
    });
    return;
  }

  if (sub === "list") {
    printJson({
      defaultDir: getDefaultDir({ cwd }),
      active: resolveCurrent({ cwd }),
      specs: listSpecs({ cwd }),
    });
    return;
  }

  if (sub === "find") {
    const name = firstPositional(rest);
    if (!name) usage();
    const result = findSpec(name, { cwd });
    printJson(result);
    if (result.ok) return;
    process.exit(result.reason === "ambiguous" ? 2 : 1);
  }

  if (sub === "resolve") {
    const input = firstPositional(rest);
    const target = input ?? resolveCurrent({ cwd }) ?? undefined;
    if (!target) {
      printJson({ ok: false, reason: "no-current" });
      process.exit(1);
    }

    if (target.startsWith("./") || target.startsWith("../") || target.includes("/") || isAbsolute(target)) {
      const resolved = resolveSpecPathForOutput(cwd, target);
      if (!isDirectory(resolved.fsPath)) {
        printJson({ ok: false, reason: "not-found", path: target });
        process.exit(1);
      }
      printJson({ ok: true, name: basename(target), ...resolved });
      return;
    }

    const found = findSpec(target, { cwd });
    if (!found.ok) {
      printJson(found);
      process.exit(found.reason === "ambiguous" ? 2 : 1);
    }
    const resolved = resolveSpecPathForOutput(cwd, found.path);
    printJson({ ok: true, name: basename(found.path), ...resolved });
    return;
  }

  usage();
}

function state(argv: string[]): never {
  const sub = argv[0];
  if (sub !== "merge") usage();
  const stateFile = argv[1];
  const patch = argv[2];
  if (!stateFile || !patch) usage();
  return runBundled("merge-state", [stateFile, patch]);
}

function tasks(argv: string[]): never {
  const sub = argv[0];
  if (sub !== "count") usage();
  const tasksFile = argv[1];
  if (!tasksFile) usage();
  return runBundled("count-tasks", [tasksFile]);
}

async function verifyBlocks(argv: string[]): Promise<void> {
  const cwd = readArg("--cwd", argv);
  const snap = buildWorkflowSnapshot({
    cwd,
    spec: readArg("--spec", argv),
  });
  if (!snap.spec?.fsPath) {
    process.stderr.write("verify-blocks: no active spec\n");
    process.exit(2);
  }
  const result = await runVerificationCheck({ repoRoot: cwd ?? process.cwd() });
  if (result.ok) process.stdout.write(result.message);
  else process.stderr.write(result.message);
  process.exit(result.code);
}

function doctor(argv: string[]): void {
  const cwd = resolve(readArg("--cwd", argv) ?? process.cwd());
  const snap = buildWorkflowSnapshot({ cwd, spec: readArg("--spec", argv) });
  const expected = [
    join(scriptRoot(), "workflow-snapshot.mjs"),
    join(scriptRoot(), "smart-route.mjs"),
    join(scriptRoot(), "merge-state.mjs"),
    join(scriptRoot(), "count-tasks.mjs"),
  ];
  printJson({
    ok: expected.every((p) => existsSync(p)),
    cwd,
    scripts: Object.fromEntries(expected.map((p) => [basename(p), existsSync(p)])),
    active: snap.active,
    spec: snap.spec,
    gates: snap.gates,
    nextAction: snap.nextAction,
  });
}

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  switch (command) {
    case "route":
      route(argv);
      return;
    case "snapshot":
      snapshot(argv);
      return;
    case "specs":
      specs(argv);
      return;
    case "state":
      state(argv);
      return;
    case "tasks":
      tasks(argv);
      return;
    case "verify-blocks":
      await verifyBlocks(argv);
      return;
    case "doctor":
      doctor(argv);
      return;
    case "-h":
    case "--help":
    case undefined:
      usage(command ? 0 : 1);
  }
  process.stderr.write(`curdx-flow: unknown command: ${command}\n`);
  usage();
}

function isDirectRun(): boolean {
  try {
    const entry = fileURLToPath(import.meta.url);
    return process.argv[1] === entry && basename(entry).startsWith("runtime-cli.");
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  void main();
}
