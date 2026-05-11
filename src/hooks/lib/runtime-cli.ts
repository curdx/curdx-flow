// src/hooks/lib/runtime-cli.ts
//
// Plugin-local command surface exposed via plugins/curdx-flow/bin/curdx-flow.
// Keep this wrapper small: it normalizes command names and delegates to the
// same TypeScript helpers that hooks and tests use.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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

function pluginRoot(): string {
  return process.env.CLAUDE_PLUGIN_ROOT || resolve(scriptRoot(), "..", "..", "..");
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

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function detectPackageManager(cwd: string): string | null {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  if (existsSync(join(cwd, "package.json"))) return "npm";
  return null;
}

function scriptCommand(packageManager: string | null, scriptName: string): string {
  switch (packageManager) {
    case "pnpm":
      return `pnpm run ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    default:
      return `npm run ${scriptName}`;
  }
}

function detectProjectScripts(cwd: string): {
  packageJson: boolean;
  packageManager: string | null;
  e2e: string[];
  devServer: string[];
  playwrightScripts: string[];
  dependencies: string[];
} {
  const pkg = readJsonFile<{
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(join(cwd, "package.json"));
  const packageManager = detectPackageManager(cwd);
  const scripts = pkg?.scripts ?? {};
  const allDependencies = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const dependencyNames = Object.keys(allDependencies).filter((name) =>
    /playwright|puppeteer|cypress|selenium|webdriver/i.test(name),
  );

  const entries = Object.entries(scripts);
  const e2e = entries
    .filter(([name, command]) =>
      /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer|selenium/i.test(
        `${name} ${command}`,
      ),
    )
    .map(([name]) => name);
  const devServer = entries
    .filter(([name]) => /^(dev|start|serve|preview)$|(^|:|-)(dev|serve|preview)(:|-|$)/i.test(name))
    .map(([name]) => name);
  const playwrightScripts = entries
    .filter(([name, command]) => /playwright/i.test(`${name} ${command}`))
    .map(([name]) => name);

  return {
    packageJson: pkg !== null,
    packageManager,
    e2e,
    devServer,
    playwrightScripts,
    dependencies: dependencyNames,
  };
}

function detectConfigFiles(cwd: string, filenames: string[]): string[] {
  return filenames.filter((name) => existsSync(join(cwd, name)));
}

function detectChrome(): { installed: boolean; path: string | null; source: string | null } {
  const envPath = process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) {
    return { installed: true, path: envPath, source: "CHROME_PATH" };
  }

  if (process.platform === "darwin") {
    const path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return existsSync(path)
      ? { installed: true, path, source: "macos-default" }
      : { installed: false, path: null, source: null };
  }

  if (process.platform === "win32") {
    const suffixes = [
      join("Google", "Chrome SxS", "Application", "chrome.exe"),
      join("Google", "Chrome", "Application", "chrome.exe"),
    ];
    const prefixes = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
    ].filter((value): value is string => Boolean(value));
    for (const prefix of prefixes) {
      for (const suffix of suffixes) {
        const candidate = join(prefix, suffix);
        if (existsSync(candidate)) {
          return { installed: true, path: candidate, source: "windows-default" };
        }
      }
    }
    return { installed: false, path: null, source: null };
  }

  for (const bin of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = spawnSync("which", [bin], { encoding: "utf8" });
    if (found.status === 0) {
      return { installed: true, path: found.stdout.trim() || bin, source: "PATH" };
    }
  }
  return { installed: false, path: null, source: null };
}

function detectChromeDevtoolsDependency(): {
  declared: boolean;
  marketplace: string | null;
} {
  const manifest = readJsonFile<{
    dependencies?: Array<{ name?: string; marketplace?: string }>;
  }>(join(pluginRoot(), ".claude-plugin", "plugin.json"));
  const dependency = manifest?.dependencies?.find((item) => item.name === "chrome-devtools-mcp");
  return {
    declared: dependency !== undefined,
    marketplace: dependency?.marketplace ?? null,
  };
}

function browserVerificationDoctor(cwd: string): unknown {
  const scripts = detectProjectScripts(cwd);
  const playwrightConfigFiles = detectConfigFiles(cwd, [
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mjs",
    "playwright.config.cjs",
    "playwright.config.mts",
    "playwright.config.cts",
  ]);
  const e2eConfigFiles = detectConfigFiles(cwd, [
    ...playwrightConfigFiles,
    "cypress.config.ts",
    "cypress.config.js",
    "cypress.json",
    ".cypressrc",
    "wdio.conf.ts",
    "wdio.conf.js",
  ]);
  const hasPlaywrightDependency = scripts.dependencies.some((name) => /(^@playwright\/test$|^playwright$|playwright-core)/i.test(name));
  const playwrightScriptCandidates = [...new Set([...scripts.playwrightScripts, ...scripts.e2e])];
  const recommendedPlaywrightCommand =
    playwrightScriptCandidates[0] !== undefined
      ? scriptCommand(scripts.packageManager, playwrightScriptCandidates[0])
      : hasPlaywrightDependency || playwrightConfigFiles.length > 0
        ? "npx playwright test"
        : null;
  const chrome = detectChrome();
  const chromeDevtools = detectChromeDevtoolsDependency();

  return {
    policy: "Playwright CLI by default; Chrome DevTools MCP for GIS/WebGL/canvas/map/GPU, console/network/performance, or flaky Playwright.",
    project: {
      packageJson: scripts.packageJson,
      packageManager: scripts.packageManager,
      devServerScripts: scripts.devServer,
      e2eScripts: scripts.e2e,
      browserAutomationDependencies: scripts.dependencies,
      e2eConfigFiles,
    },
    playwright: {
      ready:
        recommendedPlaywrightCommand !== null ||
        scripts.e2e.length > 0 ||
        playwrightConfigFiles.length > 0,
      dependency: hasPlaywrightDependency,
      configFiles: playwrightConfigFiles,
      scripts: playwrightScriptCandidates,
      recommendedCommand: recommendedPlaywrightCommand,
    },
    chromeDevtoolsMcp: {
      ready: chromeDevtools.declared && chrome.installed,
      dependencyDeclared: chromeDevtools.declared,
      marketplace: chromeDevtools.marketplace,
      chromeInstalled: chrome.installed,
      chromePath: chrome.path,
      chromeSource: chrome.source,
    },
    highFidelityUseCases: [
      "GIS/map tiles",
      "WebGL/canvas/GPU rendering",
      "console/network/performance diagnosis",
      "Playwright flaky or insufficient evidence",
    ],
  };
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
    browserVerification: browserVerificationDoctor(cwd),
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
