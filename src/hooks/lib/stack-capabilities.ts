// src/hooks/lib/stack-capabilities.ts
//
// Stack-aware routing facts for curdx-flow.
//
// This adapts the useful idea behind ECC's project-stack-mappings.json into a
// typed, Claude Code plugin-safe data source. It is intentionally read-only and
// deterministic: callers get stack profiles, quality gates, verifier commands,
// and context-budget hints without shelling out or importing platform-specific
// hook behavior.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  discoverProjectTopology,
  type CodeRoot,
  type ProjectTopology,
} from "./project-topology.js";
import { stripKnownCapabilityTokens } from "./capability-normalization.js";

export type StackCapabilityId =
  | "static-html"
  | "typescript"
  | "react"
  | "vue"
  | "next"
  | "node"
  | "spring-boot"
  | "spring-cloud"
  | "python"
  | "go"
  | "rust"
  | "claude-code-plugin";

export type QualityGatePhase =
  | "before-coding"
  | "implementation"
  | "verification"
  | "release";

export type SuggestedVerifierKind =
  | "unit"
  | "typecheck"
  | "build"
  | "e2e"
  | "browser"
  | "security"
  | "release"
  | "plugin-smoke";

export type ContextBudgetLevel = "tiny" | "focused" | "standard" | "expanded";

export interface StackCapability {
  id: StackCapabilityId;
  name: string;
  frameworks: string[];
  goalPattern: RegExp;
  manifestHints: string[];
  docsQuery: string;
  tdd: string;
  security: string;
  verifierCommands: string[];
  releaseCommands: string[];
  browser: boolean;
  contextBudget: Record<string, ContextBudgetLevel>;
}

export interface DetectedStack {
  id: StackCapabilityId;
  name: string;
  confidence: number;
  evidence: string[];
}

export interface StackProfile {
  version: 1;
  primary: StackCapabilityId | "unknown";
  detected: DetectedStack[];
  confidence: number;
  evidence: string[];
  warnings: string[];
}

export interface QualityGate {
  id: string;
  phase: QualityGatePhase;
  required: boolean;
  command: string | null;
  reason: string;
}

export interface SuggestedVerifier {
  kind: SuggestedVerifierKind;
  command: string | null;
  fallback: string | null;
  needsRuntime: boolean;
  reason: string;
}

export interface ContextBudget {
  level: ContextBudgetLevel;
  maxReferenceFiles: number;
  strategy: string;
}

interface StackCapabilityInput {
  cwd?: string;
  goal?: string;
  topology: ProjectTopology;
  route?: string;
  risk?: string;
}

const STACKS: Record<StackCapabilityId, StackCapability> = {
  "static-html": {
    id: "static-html",
    name: "Static HTML",
    frameworks: ["static-html"],
    goalPattern: /\b(static html|static frontend|static page|static web|vanilla js|vanilla javascript|plain html|html\/css\/js|index\.html|styles\.css|app\.js)\b|静态页面|原生\s*(js|javascript)/i,
    manifestHints: ["index.html"],
    docsQuery: "MDN documentation for HTML, CSS, DOM events, and browser behavior",
    tdd: "Use small DOM/browser interaction checks for user-visible behavior.",
    security: "Review DOM insertion, event handling, unsafe HTML, and local file serving assumptions.",
    verifierCommands: ["node --check app.js"],
    releaseCommands: ["node --check app.js"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "typescript": {
    id: "typescript",
    name: "TypeScript",
    frameworks: ["typescript"],
    goalPattern: /\b(ts|typescript|typecheck|tsconfig)\b/i,
    manifestHints: ["tsconfig.json", "tsconfig.*.json"],
    docsQuery: "TypeScript official documentation for compiler and project configuration",
    tdd: "Write focused tests first when behavior changes; keep typecheck as a mandatory gate.",
    security: "Review unsafe casts, unchecked external input, and dependency/script changes.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "react": {
    id: "react",
    name: "React",
    frameworks: ["react"],
    goalPattern: /\b(react|jsx|tsx|react component|react hook)\b/i,
    manifestHints: ["package.json:react"],
    docsQuery: "React official documentation for current component and hook behavior",
    tdd: "Prefer component or interaction tests for user-visible behavior.",
    security: "Review XSS, unsafe HTML, auth state leaks, and client-side permission assumptions.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "vue": {
    id: "vue",
    name: "Vue",
    frameworks: ["vue", "vite"],
    goalPattern: /\b(vue|vue3|vite|pinia|vue router|vue component)\b/i,
    manifestHints: ["package.json:vue", "vite.config.*"],
    docsQuery: "Vue and Vite official documentation for current project setup and runtime behavior",
    tdd: "Prefer component or interaction tests; keep vue-tsc/typecheck and build gates.",
    security: "Review template injection, route guards, auth state leaks, and unsafe dynamic HTML.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "next": {
    id: "next",
    name: "Next.js",
    frameworks: ["next"],
    goalPattern: /\b(next\.?js|next|app router|server action|route handler)\b/i,
    manifestHints: ["next.config.*", "package.json:next"],
    docsQuery: "Next.js official documentation for routing, server actions, rendering, and build behavior",
    tdd: "Test server/client boundaries and route handlers before broad UI changes.",
    security: "Review server/client data exposure, auth, cookies, headers, and route handlers.",
    verifierCommands: ["npm run typecheck", "npm test", "npm run build"],
    releaseCommands: ["npm run test:e2e"],
    browser: true,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "node": {
    id: "node",
    name: "Node.js",
    frameworks: ["node-api", "nestjs", "fastify", "hono"],
    goalPattern: /\b(node|api|express|fastify|nestjs|hono|server)\b/i,
    manifestHints: ["package.json"],
    docsQuery: "Node.js and framework official documentation for current API behavior",
    tdd: "Use unit/integration tests around API behavior and error paths.",
    security: "Review input validation, auth, command execution, secrets, and dependency scripts.",
    verifierCommands: ["npm test", "npm run typecheck", "npm run build"],
    releaseCommands: ["npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "spring-boot": {
    id: "spring-boot",
    name: "Spring Boot",
    frameworks: ["spring-boot"],
    goalPattern: /\b(spring boot|spring|maven|gradle|controller|service|repository)\b|后端|接口/i,
    manifestHints: ["pom.xml:spring-boot", "build.gradle:spring-boot"],
    docsQuery: "Spring Boot official documentation for current runtime, testing, and actuator behavior",
    tdd: "Use slice or integration tests for controller/service/repository behavior.",
    security: "Review auth filters, authorization, validation, configuration, and secret exposure.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "spring-cloud": {
    id: "spring-cloud",
    name: "Spring Cloud",
    frameworks: ["spring-cloud"],
    goalPattern: /\b(spring cloud|gateway|config server|eureka|openfeign|resilience4j)\b/i,
    manifestHints: ["pom.xml:spring-cloud", "build.gradle:spring-cloud"],
    docsQuery: "Spring Cloud official documentation for current integration, gateway, and config behavior",
    tdd: "Prefer integration tests or contract tests for cross-service behavior.",
    security: "Review gateway filters, service auth, config leakage, and network boundaries.",
    verifierCommands: ["./mvnw test", "./gradlew test", "mvn test", "gradle test"],
    releaseCommands: ["./mvnw verify", "./gradlew build"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "standard",
      "full-spec": "expanded",
      "epic-split": "expanded",
    },
  },
  "python": {
    id: "python",
    name: "Python",
    frameworks: ["python", "fastapi", "django", "flask"],
    goalPattern: /\b(python|pytest|fastapi|django|flask|pyproject|ruff)\b/i,
    manifestHints: ["pyproject.toml", "requirements.txt"],
    docsQuery: "Python framework official documentation for current API and testing behavior",
    tdd: "Use pytest around behavior and regression reproduction.",
    security: "Review deserialization, SQL/query construction, auth, secrets, and dependency pinning.",
    verifierCommands: ["pytest", "python -m pytest", "ruff check .", "mypy ."],
    releaseCommands: ["python -m build"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "go": {
    id: "go",
    name: "Go",
    frameworks: ["go"],
    goalPattern: /\b(go|golang|go test|go mod|goroutine|grpc)\b/i,
    manifestHints: ["go.mod"],
    docsQuery: "Go official documentation for current standard library and tooling behavior",
    tdd: "Use table-driven tests and keep go test ./... as the baseline gate.",
    security: "Review context cancellation, goroutine leaks, input validation, auth, and unsafe file/network paths.",
    verifierCommands: ["go test ./...", "go vet ./...", "go build ./..."],
    releaseCommands: ["go test ./..."],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "rust": {
    id: "rust",
    name: "Rust",
    frameworks: ["rust"],
    goalPattern: /\b(rust|cargo|crate|tokio|axum)\b/i,
    manifestHints: ["Cargo.toml"],
    docsQuery: "Rust and crate official documentation for current API and safety behavior",
    tdd: "Use cargo test and focused regression tests before implementation changes.",
    security: "Review unsafe blocks, parsing, auth, IO boundaries, and dependency features.",
    verifierCommands: ["cargo test", "cargo clippy -- -D warnings", "cargo build"],
    releaseCommands: ["cargo test"],
    browser: false,
    contextBudget: {
      "direct-change": "tiny",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
  "claude-code-plugin": {
    id: "claude-code-plugin",
    name: "Claude Code plugin",
    frameworks: ["claude-code-plugin"],
    goalPattern: /\b(claude code|plugin|skill|agent|hook|hooks|mcp|marketplace|tag|release)\b/i,
    manifestHints: [
      ".claude-plugin/plugin.json",
      "hooks/hooks.json",
      "skills/*/SKILL.md",
      "plugins/*/.claude-plugin/plugin.json",
      "plugins/*/hooks/hooks.json",
      "plugins/*/skills/*/SKILL.md",
    ],
    docsQuery: "Claude Code official docs for plugins, skills, agents, hooks, dependencies, and release tags",
    tdd: "Use focused hook/runner tests and the real Claude Code smoke path before release.",
    security: "Review hook fail-open behavior, plugin metadata, dependency declarations, and release tags.",
    verifierCommands: [
      "npm run check:hooks-fresh",
      "npm run typecheck",
      "npm run test:runner",
      "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
    ],
    releaseCommands: ["claude plugin validate ./plugins/curdx-flow", "npm run verify"],
    browser: false,
    contextBudget: {
      "direct-change": "focused",
      "lite-spec": "focused",
      "full-spec": "standard",
      "epic-split": "expanded",
    },
  },
};

const STACK_PRIORITY: Record<StackCapabilityId, number> = {
  "claude-code-plugin": 110,
  "next": 100,
  "static-html": 95,
  "react": 90,
  "vue": 90,
  "spring-cloud": 85,
  "spring-boot": 80,
  "go": 75,
  "rust": 75,
  "python": 75,
  "typescript": 30,
  "node": 20,
};

const RELEASE_GOAL_RE =
  /\b(release|publish|deploy|tag)\b|发布|部署|上线|打包|标签/i;
const NPM_RELEASE_RE =
  /\bnpm\s+(publish|release|version|tag|dist-tag)\b|\bpublish(?:ing)?\s+(?:to\s+)?npm\b|\bnpm\s+package\b/i;

function hasReleaseGoal(goal: string | undefined): boolean {
  const text = stripKnownCapabilityTokens(goal);
  return RELEASE_GOAL_RE.test(text) || NPM_RELEASE_RE.test(text);
}

function normalizeText(input: string | undefined): string {
  return (input ?? "").trim().replace(/\s+/g, " ");
}

function rootFsPath(projectRoot: string, root: CodeRoot): string {
  return isAbsolute(root.path) ? resolve(root.path) : resolve(projectRoot, root.path);
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function packageJsonContains(rootAbs: string, pattern: RegExp): boolean {
  return pattern.test(readText(join(rootAbs, "package.json")));
}

function globSegmentToRegExp(segment: string): RegExp {
  return new RegExp(
    `^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );
}

function globPathExists(rootAbs: string, hint: string): boolean {
  const parts = hint.split("/").filter(Boolean);

  function walk(dir: string, idx: number): boolean {
    if (idx >= parts.length) return existsSync(dir);
    const part = parts[idx];
    if (!part) return false;

    if (!part.includes("*")) return walk(join(dir, part), idx + 1);

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    const pattern = globSegmentToRegExp(part);
    return entries.some((entry) => pattern.test(entry.name) && walk(join(dir, entry.name), idx + 1));
  }

  return walk(rootAbs || ".", 0);
}

function hasManifestHint(rootAbs: string, hint: string): boolean {
  if (hint.includes(":")) {
    const [file, needle] = hint.split(":", 2);
    if (!file || !needle) return false;
    return readText(join(rootAbs, file)).toLowerCase().includes(needle.toLowerCase());
  }
  if (hint.includes("*")) {
    return globPathExists(rootAbs, hint);
  }
  return existsSync(join(rootAbs, hint));
}

function scoreStack(
  stack: StackCapability,
  roots: CodeRoot[],
  projectRoot: string,
  goal: string,
): DetectedStack | null {
  const evidence: string[] = [];
  let score = 0;

  if (stack.goalPattern.test(goal)) {
    score += stack.id === "claude-code-plugin"
      ? 0.46
      : ["react", "vue", "next", "spring-cloud", "spring-boot"].includes(stack.id)
        ? 0.32
        : 0.24;
    evidence.push("goal keyword");
  }

  for (const root of roots) {
    const rootAbs = rootFsPath(projectRoot, root);
    const frameworkHits = root.frameworks.filter((framework) =>
      stack.frameworks.includes(framework),
    );
    if (frameworkHits.length > 0) {
      score += 0.34;
      evidence.push(`${root.path}: framework ${frameworkHits.join(",")}`);
    }

    for (const hint of stack.manifestHints) {
      if (hasManifestHint(rootAbs, hint)) {
        score += 0.18;
        evidence.push(`${root.path}: ${hint}`);
      }
    }

    if (stack.id === "typescript" && packageJsonContains(rootAbs, /"typescript"\s*:/i)) {
      score += 0.2;
      evidence.push(`${root.path}: package.json:typescript`);
    }
  }

  if (score <= 0) return null;
  const confidence = Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
  return {
    id: stack.id,
    name: stack.name,
    confidence,
    evidence: [...new Set(evidence)].slice(0, 5),
  };
}

export function knownStackCapabilities(): StackCapability[] {
  return Object.values(STACKS);
}

export function detectStackProfile(input: StackCapabilityInput): StackProfile {
  const goal = normalizeText(stripKnownCapabilityTokens(input.goal));
  const roots = input.topology.roots;
  const detected = Object.values(STACKS)
    .map((stack) => scoreStack(stack, roots, input.topology.projectRoot, goal))
    .filter((item): item is DetectedStack => item !== null)
    .sort((a, b) =>
      b.confidence - a.confidence ||
      STACK_PRIORITY[b.id] - STACK_PRIORITY[a.id],
    );
  const primary = detected[0]?.id ?? "unknown";
  const confidence = detected[0]?.confidence ?? 0;
  const warnings: string[] = [];

  if (primary === "unknown") {
    warnings.push("No first-class stack profile detected; use repository scripts as the verifier source.");
  }
  if (detected.length > 1 && detected[0] && detected[1] && detected[1].confidence > 0.5) {
    warnings.push("Multiple stack profiles are relevant; keep verification multi-root and avoid single-stack assumptions.");
  }

  return {
    version: 1,
    primary,
    detected,
    confidence,
    evidence: detected.flatMap((item) => item.evidence).slice(0, 8),
    warnings,
  };
}

function stackFor(profile: StackProfile): StackCapability | null {
  return profile.primary === "unknown" ? null : STACKS[profile.primary];
}

function selectCommand(commands: string[], roots: CodeRoot[], projectRoot: string): string | null {
  for (const command of commands) {
    if (command.startsWith("./mvnw") && !roots.some((root) => existsSync(join(rootFsPath(projectRoot, root), "mvnw")))) {
      continue;
    }
    if (command.startsWith("./gradlew") && !roots.some((root) => existsSync(join(rootFsPath(projectRoot, root), "gradlew")))) {
      continue;
    }
    return command;
  }
  return commands[0] ?? null;
}

export function selectQualityGates(input: StackCapabilityInput & { stackProfile: StackProfile }): QualityGate[] {
  const stack = stackFor(input.stackProfile);
  const route = input.route ?? "";
  const risk = input.risk ?? "";
  if (stack === null) {
    return [
      {
        id: "repo-verification",
        phase: "verification",
        required: route !== "direct-change",
        command: null,
        reason: "No stack profile matched; use the repository's documented verification command.",
      },
    ];
  }

  const primaryCommand = selectCommand(stack.verifierCommands, input.topology.roots, input.topology.projectRoot);
  const gates: QualityGate[] = [
    {
      id: `${stack.id}-docs`,
      phase: "before-coding",
      required: /plugin|hook|skill|agent|latest|official|framework|api|sdk/i.test(
        stripKnownCapabilityTokens(input.goal),
      ) ||
        stack.id === "claude-code-plugin",
      command: null,
      reason: stack.docsQuery,
    },
    {
      id: `${stack.id}-tdd`,
      phase: "implementation",
      required: route !== "direct-change" && risk !== "low",
      command: null,
      reason: stack.tdd,
    },
    {
      id: `${stack.id}-baseline`,
      phase: "verification",
      required: true,
      command: primaryCommand,
      reason: `Baseline verification for ${stack.name}.`,
    },
  ];

  if (stack.browser) {
    gates.push({
      id: `${stack.id}-browser`,
      phase: "verification",
      required: route !== "direct-change",
      command: stack.id === "static-html" ? null : "npm run test:e2e",
      reason: "Browser-facing behavior needs Playwright or Chrome DevTools MCP evidence.",
    });
  }

  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (risk === "high" || risk === "critical" || /auth|security|permission|oauth|secret|release|publish|tag/i.test(semanticGoal)) {
    gates.push({
      id: `${stack.id}-security-review`,
      phase: "verification",
      required: risk === "critical" || /auth|security|permission|oauth|secret/i.test(semanticGoal),
      command: null,
      reason: stack.security,
    });
  }

  const releaseGoal = hasReleaseGoal(input.goal);
  if (route === "epic-split" || releaseGoal) {
    gates.push({
      id: `${stack.id}-release`,
      phase: "release",
      required: releaseGoal,
      command: selectCommand(stack.releaseCommands, input.topology.roots, input.topology.projectRoot),
      reason: `Release-facing ${stack.name} work needs the stricter release gate.`,
    });
  }

  return gates;
}

export function selectSuggestedVerifier(
  input: StackCapabilityInput & {
    stackProfile: StackProfile;
    qualityGates: QualityGate[];
  },
): SuggestedVerifier {
  const browserGate = input.qualityGates.find((gate) => gate.id.endsWith("-browser"));
  const semanticGoal = stripKnownCapabilityTokens(input.goal);
  if (browserGate && /ui|browser|frontend|page|component|css|layout|交互|页面|前端/i.test(semanticGoal)) {
    return {
      kind: "browser",
      command: browserGate.command,
      fallback: "Chrome DevTools MCP",
      needsRuntime: true,
      reason: browserGate.reason,
    };
  }

  if (input.stackProfile.primary === "claude-code-plugin") {
    return {
      kind: "plugin-smoke",
      command: "CURDX_FLOW_CLAUDE_BIN=claude npm run test:claudecc",
      fallback: "claude plugin validate ./plugins/curdx-flow",
      needsRuntime: false,
      reason: "Claude Code plugin changes need real plugin validation in addition to unit tests.",
    };
  }

  const baseline = input.qualityGates.find((gate) => gate.id.endsWith("-baseline"));
  return {
    kind: baseline?.command?.includes("build") ? "build" : "unit",
    command: baseline?.command ?? null,
    fallback: "Use the repository's documented verify command.",
    needsRuntime: false,
    reason: baseline?.reason ?? "Use local verification evidence before completion.",
  };
}

export function selectContextBudget(input: StackCapabilityInput & { stackProfile: StackProfile }): ContextBudget {
  const stack = stackFor(input.stackProfile);
  const route = input.route ?? "full-spec";
  const routeDefault: ContextBudgetLevel =
    route === "direct-change"
      ? "tiny"
      : route === "scaffold" || route === "prototype" || route === "lite-spec"
        ? "focused"
        : route === "epic-split"
          ? "expanded"
          : "standard";
  const level = stack?.contextBudget[route] ?? routeDefault;
  const limits: Record<ContextBudgetLevel, number> = {
    tiny: 2,
    focused: 4,
    standard: 8,
    expanded: 12,
  };
  return {
    level,
    maxReferenceFiles: limits[level],
    strategy:
      level === "tiny"
        ? "Read only the directly touched files plus one local convention file."
        : level === "focused"
          ? "Read the target files, nearest tests, and one relevant reference before editing."
          : level === "standard"
            ? "Use bounded discovery across source, tests, docs, and official references."
            : "Split discovery by subsystem and summarize before implementation.",
  };
}

function readArg(name: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(name);
  return idx === -1 ? undefined : argv[idx + 1];
}

function main(): void {
  const argv = process.argv.slice(2);
  const cwd = readArg("--cwd", argv);
  const goal = readArg("--goal", argv) ?? "";
  const route = readArg("--route", argv);
  const risk = readArg("--risk", argv);
  const topology = discoverProjectTopology({ cwd, goal });
  const stackProfile = detectStackProfile({ cwd, goal, topology, route, risk });
  const qualityGates = selectQualityGates({ cwd, goal, topology, route, risk, stackProfile });
  const suggestedVerifier = selectSuggestedVerifier({ cwd, goal, topology, route, risk, stackProfile, qualityGates });
  const contextBudget = selectContextBudget({ cwd, goal, topology, route, risk, stackProfile });
  process.stdout.write(JSON.stringify({
    stackProfile,
    qualityGates,
    suggestedVerifier,
    contextBudget,
  }, null, 2) + "\n");
}

function isDirectRun(): boolean {
  try {
    return process.argv[1]?.endsWith("stack-capabilities.mjs") === true;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main();
}
