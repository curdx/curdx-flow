// src/hooks/lib/dev-runtime.ts
//
// Evidence-oriented local runtime detector for curdx-flow.
//
// The goal is not to replace project-specific scripts. It discovers the
// smallest stable command surface that lets agents prove a feature in a real
// local system: start services, check health, run baseline verification, and
// stop anything curdx-flow started.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  discoverProjectTopology,
  type CodeRoot,
  type ProjectTopology,
} from "./project-topology.js";
import {
  detectStackProfile,
  selectQualityGates,
  selectSuggestedVerifier,
  type QualityGate,
  type StackProfile,
  type SuggestedVerifier,
} from "./stack-capabilities.js";

export interface DevRuntimeRoot {
  name: string;
  path: string;
  fsPath: string;
  role: string;
  kinds: string[];
  frameworks: string[];
  packageManager: string | null;
  scripts: string[];
  startCommand: string | null;
  healthCommands: string[];
  verifyCommands: string[];
  e2eCommands: string[];
  urls: string[];
}

export interface DevRuntimePlan {
  version: 1;
  cwd: string;
  projectRoot: string;
  workspaceState: ProjectTopology["workspaceState"];
  roots: DevRuntimeRoot[];
  services: Array<{
    name: string;
    root: string;
    command: string;
    logPath: string;
  }>;
  health: Array<{
    root: string;
    command: string;
  }>;
  verification: {
    baselineCommands: Array<{ root: string; command: string }>;
    e2eCommands: Array<{ root: string; command: string }>;
  };
  stackProfile: StackProfile;
  qualityGates: QualityGate[];
  suggestedVerifier: SuggestedVerifier;
  gaps: string[];
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface RuntimeState {
  version: 1;
  startedAt: string;
  cwd: string;
  projectRoot: string;
  services: Array<{
    name: string;
    root: string;
    command: string;
    pid: number;
    logPath: string;
  }>;
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function detectPackageManager(rootAbs: string): string | null {
  if (existsSync(join(rootAbs, "pnpm-lock.yaml")) || existsSync(join(rootAbs, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync(join(rootAbs, "bun.lockb")) || existsSync(join(rootAbs, "bun.lock"))) return "bun";
  if (existsSync(join(rootAbs, "yarn.lock"))) return "yarn";
  if (existsSync(join(rootAbs, "package-lock.json"))) return "npm";
  if (existsSync(join(rootAbs, "package.json"))) return "npm";
  if (existsSync(join(rootAbs, "pom.xml"))) return "maven";
  if (existsSync(join(rootAbs, "build.gradle")) || existsSync(join(rootAbs, "build.gradle.kts"))) return "gradle";
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

function firstScript(scripts: Record<string, string>, names: string[]): string | null {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(scripts, name)) return name;
  }
  return null;
}

function scriptNamesMatching(scripts: Record<string, string>, pattern: RegExp): string[] {
  return Object.entries(scripts)
    .filter(([name, command]) => pattern.test(`${name} ${command}`))
    .map(([name]) => name);
}

function defaultUrlFor(root: CodeRoot): string[] {
  if (root.frameworks.includes("vite")) return ["http://localhost:5173"];
  if (root.frameworks.includes("next") || root.frameworks.includes("react")) return ["http://localhost:3000"];
  if (root.frameworks.includes("spring-boot") || root.frameworks.includes("spring-cloud")) {
    return ["http://localhost:8080/actuator/health", "http://localhost:8080/health"];
  }
  return [];
}

function rootFsPath(projectRoot: string, root: CodeRoot): string {
  return isAbsolute(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
}

function javaCommands(rootAbs: string): {
  startCommand: string | null;
  verifyCommands: string[];
} {
  if (existsSync(join(rootAbs, "pom.xml"))) {
    const mvn = existsSync(join(rootAbs, "mvnw")) ? "./mvnw" : "mvn";
    return {
      startCommand: `${mvn} spring-boot:run`,
      verifyCommands: [`${mvn} test`],
    };
  }
  if (existsSync(join(rootAbs, "build.gradle")) || existsSync(join(rootAbs, "build.gradle.kts"))) {
    const gradle = existsSync(join(rootAbs, "gradlew")) ? "./gradlew" : "gradle";
    return {
      startCommand: `${gradle} bootRun`,
      verifyCommands: [`${gradle} test`],
    };
  }
  return { startCommand: null, verifyCommands: [] };
}

function nativeVerifyCommands(rootAbs: string): string[] {
  if (existsSync(join(rootAbs, "go.mod"))) {
    return ["go test ./...", "go vet ./..."];
  }
  if (existsSync(join(rootAbs, "Cargo.toml"))) {
    return ["cargo test", "cargo clippy -- -D warnings"];
  }
  if (
    existsSync(join(rootAbs, "pyproject.toml")) ||
    existsSync(join(rootAbs, "requirements.txt"))
  ) {
    return ["pytest", "ruff check ."];
  }
  if (existsSync(join(rootAbs, ".claude-plugin", "plugin.json"))) {
    return [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
    ];
  }
  return [];
}

function detectRoot(projectRoot: string, root: CodeRoot): DevRuntimeRoot {
  const fsPath = rootFsPath(projectRoot, root);
  const pkg = readJsonFile<PackageJson>(join(fsPath, "package.json"));
  const scripts = pkg?.scripts ?? {};
  const packageManager = detectPackageManager(fsPath);
  const scriptNames = Object.keys(scripts);
  const devScript = firstScript(scripts, ["dev", "start", "serve", "preview"]);
  const verifyScriptNames = [
    ...["typecheck", "lint", "test", "build"].filter((name) =>
      Object.prototype.hasOwnProperty.call(scripts, name),
    ),
  ];
  const e2eScriptNames = scriptNamesMatching(
    scripts,
    /(^|:|-)(e2e|browser|ui|acceptance)(:|-|$)|playwright|cypress|puppeteer/i,
  );
  const java = javaCommands(fsPath);
  const urls = defaultUrlFor(root);

  const startCommand =
    devScript !== null
      ? scriptCommand(packageManager, devScript)
      : java.startCommand;
  const healthCommands = urls.map((url) => `curl -fsS ${url}`);
  const verifyCommands = [
    ...verifyScriptNames.map((name) => scriptCommand(packageManager, name)),
    ...java.verifyCommands,
    ...nativeVerifyCommands(fsPath),
  ];
  const e2eCommands = e2eScriptNames.map((name) => scriptCommand(packageManager, name));

  return {
    name: root.name,
    path: root.path,
    fsPath,
    role: root.role,
    kinds: root.kinds,
    frameworks: root.frameworks,
    packageManager,
    scripts: scriptNames,
    startCommand,
    healthCommands,
    verifyCommands: [...new Set(verifyCommands)],
    e2eCommands: [...new Set(e2eCommands)],
    urls,
  };
}

function runtimeDir(projectRoot: string): string {
  return join(projectRoot, ".curdx");
}

function runtimeStatePath(projectRoot: string): string {
  return join(runtimeDir(projectRoot), "dev-runtime.json");
}

function serviceLogPath(projectRoot: string, name: string): string {
  return join(runtimeDir(projectRoot), `dev-${name.replace(/[^a-z0-9_-]/gi, "-")}.log`);
}

export function detectDevRuntime(input: { cwd?: string } = {}): DevRuntimePlan {
  const cwd = resolve(input.cwd ?? process.cwd());
  const topology = discoverProjectTopology({ cwd });
  const roots = topology.roots
    .filter((root) => root.access !== "missing-path")
    .map((root) => detectRoot(topology.projectRoot, root));
  const stackProfile = detectStackProfile({ cwd, topology });
  const qualityGates = selectQualityGates({ cwd, topology, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({
    cwd,
    topology,
    stackProfile,
    qualityGates,
  });
  const gaps: string[] = [];
  if (topology.workspaceState === "empty") {
    gaps.push("workspace is empty; create or import product/spec context before runtime verification");
  }
  if (roots.every((root) => root.startCommand === null)) {
    gaps.push("no dev/start command detected");
  }
  if (roots.every((root) => root.verifyCommands.length === 0)) {
    gaps.push("no baseline verification command detected");
  }
  if (
    roots.some((root) => root.kinds.includes("frontend-app")) &&
    roots.every((root) => root.e2eCommands.length === 0)
  ) {
    gaps.push("frontend/browser work has no detected e2e command");
  }

  return {
    version: 1,
    cwd,
    projectRoot: topology.projectRoot,
    workspaceState: topology.workspaceState,
    roots,
    services: roots
      .filter((root) => root.startCommand !== null)
      .map((root) => ({
        name: root.name,
        root: root.path,
        command: root.startCommand ?? "",
        logPath: serviceLogPath(topology.projectRoot, root.name),
      })),
    health: roots.flatMap((root) =>
      root.healthCommands.map((command) => ({ root: root.path, command })),
    ),
    verification: {
      baselineCommands: roots.flatMap((root) =>
        root.verifyCommands.map((command) => ({ root: root.path, command })),
      ),
      e2eCommands: roots.flatMap((root) =>
        root.e2eCommands.map((command) => ({ root: root.path, command })),
      ),
    },
    stackProfile,
    qualityGates,
    suggestedVerifier,
    gaps,
  };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRuntimeState(projectRoot: string): RuntimeState | null {
  return readJsonFile<RuntimeState>(runtimeStatePath(projectRoot));
}

export function startDevRuntime(input: { cwd?: string } = {}): RuntimeState & { gaps: string[] } {
  const plan = detectDevRuntime(input);
  mkdirSync(runtimeDir(plan.projectRoot), { recursive: true });
  const services: RuntimeState["services"] = [];

  for (const service of plan.services) {
    const root = plan.roots.find((candidate) => candidate.path === service.root);
    if (!root) continue;
    const logFd = openSync(service.logPath, "a");
    const child = spawn(service.command, {
      cwd: root.fsPath,
      shell: true,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
    });
    child.unref();
    if (typeof child.pid === "number") {
      services.push({
        name: service.name,
        root: service.root,
        command: service.command,
        pid: child.pid,
        logPath: service.logPath,
      });
    }
  }

  const state: RuntimeState & { gaps: string[] } = {
    version: 1,
    startedAt: new Date().toISOString(),
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    services,
    gaps: plan.gaps,
  };
  writeFileSync(runtimeStatePath(plan.projectRoot), JSON.stringify(state, null, 2) + "\n");
  return state;
}

export function healthDevRuntime(input: { cwd?: string; dryRun?: boolean } = {}): unknown {
  const plan = detectDevRuntime(input);
  const state = readRuntimeState(plan.projectRoot);
  const serviceStatus = (state?.services ?? []).map((service) => ({
    ...service,
    alive: isPidAlive(service.pid),
  }));
  const commandStatus = input.dryRun === true
    ? plan.health.map((item) => ({ ...item, skipped: true }))
    : plan.health.map((item) => {
      const root = plan.roots.find((candidate) => candidate.path === item.root);
      const result = spawnSync(item.command, {
        cwd: root?.fsPath ?? plan.projectRoot,
        shell: true,
        encoding: "utf8",
        timeout: 10_000,
      });
      return {
        ...item,
        exitCode: result.status ?? 1,
        ok: result.status === 0,
        stderr: result.stderr?.trim() ?? "",
      };
    });
  const ok =
    serviceStatus.length > 0 &&
    serviceStatus.every((service) => service.alive) &&
    commandStatus.every((item) => "ok" in item ? item.ok === true : true);
  return {
    ok,
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    statePath: runtimeStatePath(plan.projectRoot),
    services: serviceStatus,
    health: commandStatus,
    gaps: plan.gaps,
  };
}

export function verifyDevRuntime(input: { cwd?: string; dryRun?: boolean; includeE2e?: boolean } = {}): unknown {
  const plan = detectDevRuntime(input);
  const commands = [
    ...plan.verification.baselineCommands,
    ...(input.includeE2e === true ? plan.verification.e2eCommands : []),
  ];
  if (input.dryRun === true) {
    return {
      ok: commands.length > 0,
      dryRun: true,
      cwd: plan.cwd,
      commands,
      gaps: plan.gaps,
    };
  }
  const results = commands.map((item) => {
    const root = plan.roots.find((candidate) => candidate.path === item.root);
    const result = spawnSync(item.command, {
      cwd: root?.fsPath ?? plan.projectRoot,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    return {
      ...item,
      exitCode: result.status ?? 1,
      ok: result.status === 0,
    };
  });
  return {
    ok: commands.length > 0 && results.every((item) => item.ok),
    cwd: plan.cwd,
    commands: results,
    gaps: plan.gaps,
  };
}

export function stopDevRuntime(input: { cwd?: string } = {}): unknown {
  const plan = detectDevRuntime(input);
  const state = readRuntimeState(plan.projectRoot);
  const stopped = (state?.services ?? []).map((service) => {
    let ok = false;
    let alreadyStopped = false;
    try {
      process.kill(-service.pid, "SIGTERM");
      ok = true;
    } catch {
      try {
        process.kill(service.pid, "SIGTERM");
        ok = true;
      } catch {
        alreadyStopped = !isPidAlive(service.pid);
      }
    }
    return { ...service, stopped: ok, alreadyStopped };
  });
  rmSync(runtimeStatePath(plan.projectRoot), { force: true });
  return {
    ok: stopped.every((service) => service.stopped || service.alreadyStopped),
    cwd: plan.cwd,
    projectRoot: plan.projectRoot,
    stopped,
  };
}
