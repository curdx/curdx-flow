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
import { walkSrcTree } from "./verify-blocks.js";
import {
  detectDevRuntime,
  healthDevRuntime,
  startDevRuntime,
  stopDevRuntime,
  verifyDevRuntime,
} from "./dev-runtime.js";
import { discoverProjectTopology } from "./project-topology.js";
import {
  detectStackProfile,
  selectContextBudget,
  selectQualityGates,
  selectSuggestedVerifier,
} from "./stack-capabilities.js";
import { buildExecutionBrief } from "./execution-brief.js";
import { appendBrainEvent, summarizeProjectBrain } from "./project-brain.js";
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
    "  route --goal <text> [--name <spec>] [--flags <args>] [--cwd <dir>] [--compile] [--record]",
    "  snapshot [--spec <name-or-path>] [--goal <text>] [--cwd <dir>]",
    "  specs dirs [--cwd <dir>]",
    "  specs list [--cwd <dir>]",
    "  specs find <name> [--cwd <dir>]",
    "  specs resolve [name-or-path] [--cwd <dir>]",
    "  state merge <state-file> <json-patch>",
    "  tasks count <tasks.md>",
    "  dev detect [--cwd <dir>]",
    "  dev up [--cwd <dir>]",
    "  dev health [--cwd <dir>] [--dry-run]",
    "  dev verify [--cwd <dir>] [--dry-run] [--include-e2e]",
    "  dev down [--cwd <dir>]",
    "  verify run --command <cmd> [--phase execution] [--spec <name-or-path>] [--cwd <dir>] [--description <text>]",
    "  verify-blocks [--cwd <dir>] [--spec <name-or-path>]",
    "  doctor [--cwd <dir>] [--goal <text>]",
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

function repoRootFromPlugin(): string {
  return resolve(pluginRoot(), "..", "..");
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
  const availableRaw = readArg("--available-capabilities", argv);
  const input = {
    goal: readArg("--goal", argv) ?? "",
    name: readArg("--name", argv),
    flags: readArg("--flags", argv) ?? "",
    cwd: readArg("--cwd", argv),
    changedFiles: parseList(readArg("--files", argv)),
    availableCapabilities: availableRaw === undefined ? undefined : parseList(availableRaw),
    estimatedFiles: estimatedRaw === undefined ? undefined : Number(estimatedRaw),
    taskCount: taskRaw === undefined ? undefined : Number(taskRaw),
  };
  if (hasFlag(argv, "--compile")) {
    printJson(buildExecutionBrief({ ...input, record: hasFlag(argv, "--record") }));
    return;
  }
  printJson(classifySmartRoute(input));
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

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
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

interface HookCommandConfig {
  type?: unknown;
  command?: unknown;
  args?: unknown;
  shell?: unknown;
}

interface HookMatcherConfig {
  hooks?: HookCommandConfig[];
}

interface HooksConfig {
  hooks?: Record<string, HookMatcherConfig[]>;
}

interface PluginManifest {
  name?: string;
  version?: string;
  dependencies?: Array<{ name?: string; marketplace?: string; version?: string }>;
}

interface MarketplaceManifest {
  allowCrossMarketplaceDependenciesOn?: string[];
  plugins?: Array<{ name?: string; version?: string }>;
}

const EXPECTED_PLUGIN_DEPENDENCIES = [
  { name: "pua", marketplace: "pua-skills" },
  { name: "claude-mem", marketplace: "thedotmack" },
  { name: "chrome-devtools-mcp", marketplace: "chrome-devtools-plugins" },
  { name: "frontend-design", marketplace: "claude-plugins-official" },
] as const;

const EXPECTED_EXTERNAL_MCPS = [
  {
    id: "context7",
    match: /context7|mcp\.context7\.com/i,
    installHint: "Installed externally by setup script; expected to appear in `claude mcp list`.",
  },
  {
    id: "sequential-thinking",
    match: /sequential[- ]thinking|server-sequential-thinking/i,
    installHint: "Installed externally by setup script; expected to appear in `claude mcp list`.",
  },
] as const;

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

function shellToken(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replace(/'/g, `'\\''`)}'`;
}

function pluginDependencyDoctor(): unknown {
  const manifest = readJsonFile<PluginManifest>(join(pluginRoot(), ".claude-plugin", "plugin.json"));
  const marketplace = readJsonFile<MarketplaceManifest>(
    join(repoRootFromPlugin(), ".claude-plugin", "marketplace.json"),
  );
  const declared = manifest?.dependencies ?? [];
  const allowlist = new Set(marketplace?.allowCrossMarketplaceDependenciesOn ?? []);
  const dependencies = EXPECTED_PLUGIN_DEPENDENCIES.map((expected) => {
    const actual = declared.find((item) => item.name === expected.name);
    const marketplaceName = actual?.marketplace ?? null;
    return {
      name: expected.name,
      type: "plugin",
      expectedMarketplace: expected.marketplace,
      declared: actual !== undefined,
      marketplace: marketplaceName,
      marketplaceMatches: marketplaceName === expected.marketplace,
      crossMarketplaceAllowlisted: allowlist.has(expected.marketplace),
      versionConstraint: actual?.version ?? null,
      wheelFirst: true,
      curdxRole: "recommend/gate; do not reimplement",
    };
  });
  return {
    ready: dependencies.every((item) =>
      item.declared &&
      item.marketplaceMatches &&
      item.crossMarketplaceAllowlisted,
    ),
    dependencies,
    warnings: dependencies
      .filter((item) => item.versionConstraint === null)
      .map((item) =>
        `${item.name} has no dependency version constraint; keep this intentional unless upstream tags are confirmed.`,
      ),
  };
}

function externalMcpDoctor(): unknown {
  const envOutput = process.env.CURDX_FLOW_MCP_LIST_OUTPUT;
  const bin = process.env.CURDX_FLOW_CLAUDE_BIN ?? "claude";
  let source = "claude mcp list";
  let output = "";
  let exitCode: number | null = null;
  let error: string | null = null;

  if (envOutput !== undefined) {
    source = "CURDX_FLOW_MCP_LIST_OUTPUT";
    output = envOutput;
    exitCode = 0;
  } else {
    const result = spawnSync("zsh", ["-lic", `${shellToken(bin)} mcp list`], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    exitCode = result.status ?? null;
    if (result.error) {
      error = (result.error as Error).message;
    }
  }

  const commandWorked = exitCode === 0;
  const servers = EXPECTED_EXTERNAL_MCPS.map((expected) => {
    const configured = commandWorked ? expected.match.test(output) : null;
    return {
      id: expected.id,
      type: "mcp",
      expectedExternal: true,
      bundledByCurdxFlow: false,
      configured,
      status: configured === true ? "available" : configured === false ? "missing" : "unknown",
      installHint: expected.installHint,
    };
  });

  return {
    ready: servers.every((server) => server.configured === true),
    source,
    command: `${bin} mcp list`,
    exitCode,
    error,
    servers,
    note: "curdx-flow does not bundle these MCP servers; setup scripts or user MCP config own installation.",
  };
}

function releaseDoctor(): unknown {
  const pkg = readJsonFile<{ version?: string }>(join(repoRootFromPlugin(), "package.json"));
  const lock = readJsonFile<{ version?: string; packages?: Record<string, { version?: string }> }>(
    join(repoRootFromPlugin(), "package-lock.json"),
  );
  const manifest = readJsonFile<PluginManifest>(join(pluginRoot(), ".claude-plugin", "plugin.json"));
  const marketplace = readJsonFile<MarketplaceManifest>(
    join(repoRootFromPlugin(), ".claude-plugin", "marketplace.json"),
  );
  const marketplaceEntry = marketplace?.plugins?.find((item) => item.name === "curdx-flow");
  const versions = {
    packageJson: pkg?.version ?? null,
    packageLockRoot: lock?.version ?? null,
    packageLockPackage: lock?.packages?.[""]?.version ?? null,
    pluginManifest: manifest?.version ?? null,
    marketplace: marketplaceEntry?.version ?? null,
  };
  const values = Object.values(versions);
  const aligned = values.every((value) => value !== null && value === values[0]);
  const version = aligned ? values[0] : null;
  return {
    ready: aligned,
    versions,
    expectedNpmTag: version ? `v${version}` : null,
    expectedPluginTag: version ? `curdx-flow--v${version}` : null,
    commands: [
      "npm run check-versions",
      "claude plugin validate ./plugins/curdx-flow",
      "npm run verify",
      "claude plugin tag --push",
      version ? `git tag v${version} && git push origin v${version}` : "git tag vX.Y.Z && git push origin vX.Y.Z",
    ],
  };
}

function isPluginSmokeScript(name: string, command: string): boolean {
  return /claudecc|claude-code|claude code|plugin[-:]?smoke|plugin validate/i.test(`${name} ${command}`);
}

function detectProjectScripts(cwd: string): {
  packageJson: boolean;
  packageManager: string | null;
  e2e: string[];
  devServer: string[];
  playwrightScripts: string[];
  pluginSmokeScripts: string[];
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
  const browserEntries = entries.filter(([name, command]) => !isPluginSmokeScript(name, command));
  const e2e = entries
    .filter(([name, command]) =>
      !isPluginSmokeScript(name, command) &&
      /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer|selenium/i.test(
        `${name} ${command}`,
      ),
    )
    .map(([name]) => name);
  const devServer = entries
    .filter(([name]) => /^(dev|start|serve|preview)$|(^|:|-)(dev|serve|preview)(:|-|$)/i.test(name))
    .map(([name]) => name);
  const playwrightScripts = browserEntries
    .filter(([name, command]) => /playwright/i.test(`${name} ${command}`))
    .map(([name]) => name);
  const pluginSmokeScripts = entries
    .filter(([name, command]) => isPluginSmokeScript(name, command))
    .map(([name]) => name);

  return {
    packageJson: pkg !== null,
    packageManager,
    e2e,
    devServer,
    playwrightScripts,
    pluginSmokeScripts,
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
  const manifest = readJsonFile<PluginManifest>(join(pluginRoot(), ".claude-plugin", "plugin.json"));
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
      pluginSmokeScripts: scripts.pluginSmokeScripts,
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

function collectCommandHooks(config: HooksConfig | null): Array<{
  event: string;
  command: string | null;
  args: string[];
  shell: string | null;
  execForm: boolean;
  scriptArg: string | null;
  scriptPath: string | null;
  scriptExists: boolean | null;
}> {
  const root = pluginRoot();
  const prefix = "${CLAUDE_PLUGIN_ROOT}/";
  const out: Array<{
    event: string;
    command: string | null;
    args: string[];
    shell: string | null;
    execForm: boolean;
    scriptArg: string | null;
    scriptPath: string | null;
    scriptExists: boolean | null;
  }> = [];

  for (const [event, matchers] of Object.entries(config?.hooks ?? {})) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      if (!Array.isArray(matcher.hooks)) continue;
      for (const hook of matcher.hooks) {
        if (hook.type !== "command") continue;
        const command = typeof hook.command === "string" ? hook.command : null;
        const args = Array.isArray(hook.args)
          ? hook.args.filter((arg): arg is string => typeof arg === "string")
          : [];
        const scriptArg = args[0] ?? null;
        const scriptPath =
          scriptArg?.startsWith(prefix) === true
            ? join(root, scriptArg.slice(prefix.length))
            : null;
        out.push({
          event,
          command,
          args,
          shell: typeof hook.shell === "string" ? hook.shell : null,
          execForm: command === "node" && scriptArg !== null && scriptArg.startsWith(prefix),
          scriptArg,
          scriptPath,
          scriptExists: scriptPath === null ? null : existsSync(scriptPath),
        });
      }
    }
  }

  return out;
}

function pluginHealthDoctor(): unknown {
  const root = pluginRoot();
  const manifestPath = join(root, ".claude-plugin", "plugin.json");
  const hooksPath = join(root, "hooks", "hooks.json");
  const binPath = join(root, "bin", "curdx-flow");
  const manifest = readJsonFile<PluginManifest>(manifestPath);
  const hooksConfig = readJsonFile<HooksConfig>(hooksPath);
  const commandHooks = collectCommandHooks(hooksConfig);
  const shellFormHooks = commandHooks.filter((hook) => !hook.execForm || hook.shell !== null);
  const missingScripts = commandHooks.filter((hook) => hook.scriptExists === false);
  const validHooksObject =
    hooksConfig !== null && typeof hooksConfig.hooks === "object" && hooksConfig.hooks !== null;
  const ready =
    existsSync(root) &&
    manifest !== null &&
    manifest.name === "curdx-flow" &&
    existsSync(binPath) &&
    validHooksObject &&
    commandHooks.length > 0 &&
    shellFormHooks.length === 0 &&
    missingScripts.length === 0;

  return {
    ready,
    root,
    dataDir: process.env.CLAUDE_PLUGIN_DATA ?? null,
    manifest: {
      path: manifestPath,
      exists: existsSync(manifestPath),
      valid: manifest !== null,
      name: manifest?.name ?? null,
      version: manifest?.version ?? null,
    },
    dependencies: pluginDependencyDoctor(),
    hooks: {
      path: hooksPath,
      exists: existsSync(hooksPath),
      valid: validHooksObject,
      commandHookCount: commandHooks.length,
      execForm: shellFormHooks.length === 0,
      shellFormHooks: shellFormHooks.map((hook) => ({
        event: hook.event,
        command: hook.command,
        args: hook.args,
        shell: hook.shell,
      })),
      missingScripts: missingScripts.map((hook) => ({
        event: hook.event,
        scriptArg: hook.scriptArg,
        scriptPath: hook.scriptPath,
      })),
    },
    bin: {
      curdxFlow: existsSync(binPath),
      path: binPath,
    },
  };
}

function hookFreshnessDoctor(): unknown {
  const sourceRoot = join(repoRootFromPlugin(), "src", "hooks");
  const bundleRoot = join(pluginRoot(), "hooks", "scripts");
  const pairs: Array<[string, string]> = [
    ["user-prompt-expansion-guard.ts", "user-prompt-expansion-guard.mjs"],
    ["post-tool-batch-snapshot.ts", "post-tool-batch-snapshot.mjs"],
    ["task-completed-verifier.ts", "task-completed-verifier.mjs"],
    [join("lib", "smart-route.ts"), join("lib", "smart-route.mjs")],
    [join("lib", "tool-capabilities.ts"), join("lib", "tool-capabilities.mjs")],
    [join("lib", "stack-capabilities.ts"), join("lib", "stack-capabilities.mjs")],
    [join("lib", "dev-runtime.ts"), join("lib", "dev-runtime.mjs")],
    [join("lib", "runtime-cli.ts"), join("lib", "runtime-cli.mjs")],
  ];
  const entries = pairs.map(([srcRel, bundleRel]) => {
    const sourcePath = join(sourceRoot, srcRel);
    const bundlePath = join(bundleRoot, bundleRel);
    const sourceExists = existsSync(sourcePath);
    const bundleExists = existsSync(bundlePath);
    const sourceMtime = sourceExists ? statSync(sourcePath).mtimeMs : null;
    const bundleMtime = bundleExists ? statSync(bundlePath).mtimeMs : null;
    return {
      source: srcRel,
      bundle: bundleRel,
      sourceExists,
      bundleExists,
      fresh: sourceMtime === null || bundleMtime === null ? false : bundleMtime >= sourceMtime,
    };
  });
  const sourceAvailable = existsSync(sourceRoot);
  return {
    sourceAvailable,
    bundleRoot,
    fresh: entries.every((entry) => entry.fresh),
    stale: entries.filter((entry) => !entry.fresh),
    entries,
    checkCommand: "npm run check:hooks-fresh",
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

function dev(argv: string[]): void {
  const [sub, ...rest] = argv;
  const cwd = readArg("--cwd", rest);
  switch (sub) {
    case "detect":
      printJson(detectDevRuntime({ cwd }));
      return;
    case "up":
      printJson(startDevRuntime({ cwd }));
      return;
    case "health":
      printJson(healthDevRuntime({ cwd, dryRun: hasFlag(rest, "--dry-run") }));
      return;
    case "verify": {
      const result = verifyDevRuntime({
        cwd,
        dryRun: hasFlag(rest, "--dry-run"),
        includeE2e: hasFlag(rest, "--include-e2e"),
      }) as { ok?: boolean };
      printJson(result);
      if (result.ok === false && !hasFlag(rest, "--dry-run")) process.exit(1);
      return;
    }
    case "down":
      printJson(stopDevRuntime({ cwd }));
      return;
    default:
      usage();
  }
}

async function verify(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "run") usage();
  const command = readArg("--command", rest);
  if (!command) usage();
  const cwd = resolve(readArg("--cwd", rest) ?? process.cwd());
  const phase = readArg("--phase", rest) ?? "execution";
  if (!["research", "requirements", "design", "tasks", "execution"].includes(phase)) {
    process.stderr.write(`verify run: unsupported phase: ${phase}\n`);
    process.exit(2);
  }

  const snap = buildWorkflowSnapshot({
    cwd,
    spec: readArg("--spec", rest),
  });
  if (!snap.spec?.fsPath || !snap.spec.statePath) {
    process.stderr.write("verify run: no active spec\n");
    process.exit(2);
  }

  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  const exitCode = result.status ?? 1;
  if (result.error) {
    process.stderr.write(`verify run: ${(result.error as Error).message}\n`);
  }

  const timestamp = new Date().toISOString();
  const srcMtime = await walkSrcTree(snap.spec.fsPath);
  const block: Record<string, unknown> = {
    command,
    exitCode,
    timestamp,
    srcMtime,
    description: readArg("--description", rest) ?? `Verification for ${phase}`,
  };
  if (exitCode !== 0) {
    block.failedReason = result.error
      ? (result.error as Error).message
      : `command exited ${exitCode}`;
  }

  const patch = JSON.stringify({
    verificationBlocks: {
      [phase]: block,
    },
  });
  const merge = spawnSync(process.execPath, [join(scriptRoot(), "merge-state.mjs"), snap.spec.statePath, patch], {
    cwd,
    encoding: "utf8",
    stdio: ["inherit", "ignore", "pipe"],
  });
  if (merge.stderr) process.stderr.write(merge.stderr);
  if (merge.error) {
    process.stderr.write(`verify run: failed to record verification: ${(merge.error as Error).message}\n`);
    process.exit(1);
  }
  if (merge.status !== 0) {
    process.exit(merge.status ?? 1);
  }
  appendBrainEvent(cwd, {
    type: "verification-run",
    phase,
    command,
    exitCode,
    reason: exitCode === 0 ? "verification passed" : `command exited ${exitCode}`,
  });
  process.exit(exitCode);
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
  const goal = readArg("--goal", argv) ?? "";
  const routeFacts = classifySmartRoute({ cwd, goal });
  const topology = discoverProjectTopology({ cwd, goal });
  const stackProfile = detectStackProfile({ cwd, goal, topology, route: routeFacts.route, risk: routeFacts.policy.risk });
  const qualityGates = selectQualityGates({ cwd, goal, topology, route: routeFacts.route, risk: routeFacts.policy.risk, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({ cwd, goal, topology, route: routeFacts.route, risk: routeFacts.policy.risk, stackProfile, qualityGates });
  const contextBudget = selectContextBudget({ cwd, goal, topology, route: routeFacts.route, risk: routeFacts.policy.risk, stackProfile });
  const brain = summarizeProjectBrain(cwd);
  const executionBrief = buildExecutionBrief({ cwd, goal, routeFacts });
  const expected = [
    join(scriptRoot(), "workflow-snapshot.mjs"),
    join(scriptRoot(), "smart-route.mjs"),
    join(scriptRoot(), "stack-capabilities.mjs"),
    join(scriptRoot(), "merge-state.mjs"),
    join(scriptRoot(), "count-tasks.mjs"),
  ];
  const runtimeReady = expected.every((p) => existsSync(p));
  const plugin = pluginHealthDoctor() as { ready?: boolean };
  const hookFreshness = hookFreshnessDoctor() as { fresh?: boolean; sourceAvailable?: boolean };
  const root = pluginRoot();
  printJson({
    ok: runtimeReady && plugin.ready === true && (hookFreshness.sourceAvailable !== true || hookFreshness.fresh === true),
    cwd,
    scripts: Object.fromEntries(expected.map((p) => [basename(p), existsSync(p)])),
    runtime: {
      ready: runtimeReady,
      scripts: Object.fromEntries(expected.map((p) => [basename(p), existsSync(p)])),
    },
    plugin,
    hookFreshness,
    release: releaseDoctor(),
    docsSensitiveWarnings: [
      "Claude Code plugin, skill, agent, hook, dependency, marketplace, and tag behavior must be verified against https://code.claude.com/docs/llms.txt before release-facing changes.",
      "context7 and sequential-thinking are expected external MCP servers in this environment; curdx-flow should diagnose them but not bundle duplicate MCP config.",
    ],
    route: routeFacts.route,
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
    brain,
    executionBrief,
    externalMcp: externalMcpDoctor(),
    browserVerification: browserVerificationDoctor(cwd),
    active: snap.active,
    spec: snap.spec,
    gates: snap.gates,
    nextAction: snap.nextAction,
    recommendations: [
      { id: "workflow", action: snap.nextAction },
      { id: "plugin-validate", command: `claude plugin validate ${root}` },
      {
        id: "plugin-smoke",
        command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
      },
    ],
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
    case "dev":
      dev(argv);
      return;
    case "verify":
      await verify(argv);
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
