// tests/runner/manifest-integrity.test.ts
//
// Structural validation for plugin manifests under plugins/curdx-flow/:
//
//   - agents/*.md        — subagent prompt markdown
//   - skills/*/SKILL.md  — user-facing slash skills and support skills
//
// This catches invalid frontmatter, missing migrated entrypoint skills, stale
// plugin.json paths, and broken reference links before a release ships.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins", "curdx-flow");

const PLUGIN_MANIFEST = path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
const MARKETPLACE_MANIFEST = path.join(REPO_ROOT, ".claude-plugin", "marketplace.json");
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents");
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");
const REFERENCES_DIR = path.join(PLUGIN_ROOT, "references");
const HOOKS_CONFIG = path.join(PLUGIN_ROOT, "hooks", "hooks.json");
const BIN_DIR = path.join(PLUGIN_ROOT, "bin");

const LEGACY_ENTRYPOINT_SKILLS = [
  "cancel",
  "design",
  "feedback",
  "help",
  "implement",
  "index",
  "new",
  "refactor",
  "requirements",
  "research",
  "start",
  "status",
  "switch",
  "tasks",
  "triage",
] as const;

const SUPPORT_SKILLS = [
  "communication-style",
  "curdx-core",
  "interview-framework",
  "spec-workflow",
  "verification-before-completion",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFrontmatter(body: string): string | null {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m && m[1] !== undefined ? m[1] : null;
}

function parseFrontmatterFields(fm: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      fields.set(m[1], m[2].trim());
    }
  }
  return fields;
}

function findReferenceNames(body: string): string[] {
  const matches = [...body.matchAll(/references\/([A-Za-z0-9_-]+)\.md/g)];
  return [...new Set(matches.map((m) => m[1] as string))];
}

function listMarkdown(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function listSkillManifests(dir: string): string[] {
  const out: string[] = [];
  for (const sub of readdirSync(dir)) {
    const subPath = path.join(dir, sub);
    if (!statSync(subPath).isDirectory()) continue;
    const skillMd = path.join(subPath, "SKILL.md");
    if (existsSync(skillMd)) out.push(skillMd);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

const AGENT_FILES = listMarkdown(AGENTS_DIR);
const SKILL_FILES = listSkillManifests(SKILLS_DIR);

describe("manifest discovery", () => {
  it("plugin.json declares official metadata and skills-only component paths", () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")) as {
      name?: string;
      version?: string;
      homepage?: string;
      repository?: string;
      license?: string;
      skills?: string | string[];
      commands?: string | string[];
      agents?: string | string[];
      hooks?: string | string[];
      dependencies?: Array<{ name?: string; marketplace?: string }>;
    };

    expect(manifest.name).toBe("curdx-flow");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(manifest.homepage).toMatch(/^https:\/\/github\.com\/curdx\/curdx-flow/);
    expect(manifest.repository).toBe("https://github.com/curdx/curdx-flow");
    expect(manifest.license).toBe("MIT");
    expect(manifest.commands, "commands must not be declared after skills-only migration").toBeUndefined();
    expect(
      manifest.hooks,
      "standard hooks/hooks.json is auto-discovered; plugin.json must not redeclare it",
    ).toBeUndefined();

    for (const key of ["skills", "agents"] as const) {
      const value = manifest[key];
      expect(value, `plugin.json: missing ${key}`).toBeDefined();
      const paths = Array.isArray(value) ? value : [value!];
      expect(paths.length, `plugin.json: ${key} path list must be non-empty`).toBeGreaterThan(0);
      for (const relPath of paths) {
        expect(relPath, `plugin.json: ${key} path must start with ./`).toMatch(/^\.\//);
        expect(
          existsSync(path.join(PLUGIN_ROOT, relPath)),
          `plugin.json: ${key} path does not exist: ${relPath}`,
        ).toBe(true);
      }
    }

    expect(
      existsSync(HOOKS_CONFIG),
      "standard hooks/hooks.json must exist for automatic hook discovery",
    ).toBe(true);
    expect(existsSync(path.join(BIN_DIR, "curdx-flow")), "plugin bin/curdx-flow must exist").toBe(
      true,
    );
  });

  it("declares required plugin dependencies through the official dependency model", () => {
    const manifest = JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")) as {
      dependencies?: Array<{ name?: string; marketplace?: string }>;
    };
    const marketplace = JSON.parse(readFileSync(MARKETPLACE_MANIFEST, "utf8")) as {
      allowCrossMarketplaceDependenciesOn?: string[];
    };

    expect(manifest.dependencies).toEqual([
      { name: "pua", marketplace: "pua-skills" },
      { name: "claude-mem", marketplace: "thedotmack" },
      { name: "chrome-devtools-mcp", marketplace: "chrome-devtools-plugins" },
      { name: "frontend-design", marketplace: "claude-plugins-official" },
    ]);
    expect(marketplace.allowCrossMarketplaceDependenciesOn).toEqual(
      expect.arrayContaining([
        "pua-skills",
        "thedotmack",
        "chrome-devtools-plugins",
        "claude-plugins-official",
      ]),
    );
  });

  it("has no commands directory and includes all migrated slash skills", () => {
    expect(existsSync(path.join(PLUGIN_ROOT, "commands"))).toBe(false);
    expect(AGENT_FILES.length).toBeGreaterThanOrEqual(5);
    expect(SKILL_FILES.length).toBeGreaterThanOrEqual(LEGACY_ENTRYPOINT_SKILLS.length + 3);

    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      expect(
        existsSync(path.join(SKILLS_DIR, name, "SKILL.md")),
        `missing migrated slash skill: ${name}`,
      ).toBe(true);
    }
  });

  it("references/ directory exists and contains at least 5 .md files", () => {
    expect(existsSync(REFERENCES_DIR)).toBe(true);
    const refs = listMarkdown(REFERENCES_DIR);
    expect(refs.length).toBeGreaterThanOrEqual(5);
  });
});

describe("agents frontmatter integrity", () => {
  it.each(AGENT_FILES.map((f) => [path.basename(f), f]))(
    "%s has non-empty `name` and `description`",
    (_label, file) => {
      const body = readFileSync(file, "utf8");
      const fm = extractFrontmatter(body);
      expect(fm, `${file}: missing frontmatter`).not.toBeNull();
      const fields = parseFrontmatterFields(fm!);
      expect(fields.get("name"), `${file}: missing/empty 'name'`).toBeTruthy();
      expect(fields.get("description"), `${file}: missing/empty 'description'`).toBeTruthy();
    },
  );

  it("agent `name` field matches its filename (kebab-case)", () => {
    for (const file of AGENT_FILES) {
      const expectedName = path.basename(file, ".md");
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const name = parseFrontmatterFields(fm!).get("name");
      expect(name, `${file}: name must match filename`).toBe(expectedName);
    }
  });

  it("agents declare official runtime frontmatter fields", () => {
    const allowedModels = new Set(["inherit", "haiku", "sonnet", "opus"]);
    const allowedEffort = new Set(["low", "medium", "high", "xhigh", "max"]);

    for (const file of AGENT_FILES) {
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);
      const model = fields.get("model");
      const effort = fields.get("effort");
      const maxTurns = fields.get("maxTurns");

      expect(model, `${file}: missing model`).toBeDefined();
      expect(allowedModels.has(model!), `${file}: unsupported model ${model}`).toBe(true);
      expect(effort, `${file}: missing effort`).toBeDefined();
      expect(allowedEffort.has(effort!), `${file}: unsupported effort ${effort}`).toBe(true);
      expect(maxTurns, `${file}: missing maxTurns`).toMatch(/^[1-9]\d*$/);
    }
  });

  it("read-only reviewer agents do not allow write tools", () => {
    for (const filename of ["spec-reviewer.md", "code-quality-reviewer.md"]) {
      const file = path.join(AGENTS_DIR, filename);
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);
      const tools = fields.get("tools");
      expect(tools, `${file}: missing tools allowlist`).toBeDefined();
      expect(tools).not.toMatch(/\b(Write|Edit|MultiEdit)\b/);
    }
  });
});

describe("hooks config integrity", () => {
  it("command hooks declare statusMessage and bounded timeout", () => {
    const config = JSON.parse(readFileSync(HOOKS_CONFIG, "utf8")) as {
      hooks?: Record<string, Array<{ hooks?: Array<Record<string, unknown>> }>>;
    };
    expect(config.hooks).toBeDefined();

    for (const [event, matchers] of Object.entries(config.hooks ?? {})) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks ?? []) {
          if (hook.type !== "command") continue;
          expect(hook.command, `${event}: command hook missing command`).toEqual(
            expect.any(String),
          );
          expect(hook.statusMessage, `${event}: command hook missing statusMessage`).toEqual(
            expect.any(String),
          );
          expect(hook.timeout, `${event}: command hook missing timeout`).toEqual(
            expect.any(Number),
          );
          expect(
            Number(hook.timeout) > 0 && Number(hook.timeout) <= 60,
            `${event}: timeout must be in 1..60 seconds`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("skills frontmatter integrity", () => {
  it.each(SKILL_FILES.map((f) => [path.relative(SKILLS_DIR, f), f]))(
    "%s has non-empty `name` and `description`",
    (_label, file) => {
      const body = readFileSync(file, "utf8");
      const fm = extractFrontmatter(body);
      expect(fm, `${file}: missing frontmatter`).not.toBeNull();
      const fields = parseFrontmatterFields(fm!);
      expect(fields.get("name"), `${file}: missing/empty 'name'`).toBeTruthy();
      expect(fields.get("description"), `${file}: missing/empty 'description'`).toBeTruthy();
    },
  );

  it("skill `name` field matches its parent directory name", () => {
    for (const file of SKILL_FILES) {
      const expectedName = path.basename(path.dirname(file));
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const name = parseFrontmatterFields(fm!).get("name");
      expect(name, `${file}: name must match parent dir`).toBe(expectedName);
    }
  });

  it("skill descriptions stay concise and use when_to_use for trigger detail", () => {
    for (const file of SKILL_FILES) {
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);
      const desc = fields.get("description") ?? "";
      const whenToUse = fields.get("when_to_use") ?? "";

      expect(desc.length, `${file}: description should stay concise`).toBeLessThanOrEqual(220);
      expect(
        desc.length + whenToUse.length,
        `${file}: description + when_to_use exceeds Claude Code listing cap`,
      ).toBeLessThanOrEqual(1536);
    }
  });

  it("migrated public entrypoint skills are explicit user-invoked tasks", () => {
    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);

      expect(fields.get("name")).toBe(name);
      expect(fields.get("description"), `${file}: missing slash menu description`).toBeDefined();
      expect(fields.get("disable-model-invocation")).toBe("true");
    }
  });

  it("public entrypoint descriptions are trigger-focused", () => {
    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const desc = parseFrontmatterFields(fm!).get("description") ?? "";

      expect(desc, `${file}: description must describe when to use the skill`).toMatch(
        /^Use when\b/,
      );
      expect(desc.length, `${file}: public entrypoint description should stay terse`).toBeLessThanOrEqual(
        120,
      );
    }
  });

  it("support skills are model-invocable background guidance, not slash-menu commands", () => {
    for (const name of SUPPORT_SKILLS) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const fields = parseFrontmatterFields(fm!);
      const desc = fields.get("description") ?? "";

      expect(fields.get("user-invocable"), `${file}: support skills should stay hidden`).toBe(
        "false",
      );
      expect(
        fields.get("disable-model-invocation"),
        `${file}: support skills should remain available to Claude when relevant`,
      ).not.toBe("true");
      expect(desc, `${file}: support skill descriptions should be trigger-focused`).toMatch(
        /^Use when\b/,
      );
    }
  });

  it("public entrypoint skills avoid wildcard tool grants", () => {
    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const fm = extractFrontmatter(readFileSync(file, "utf8"));
      const tools = parseFrontmatterFields(fm!).get("allowed-tools");

      if (tools === undefined) continue;
      expect(tools, `${file}: avoid broad wildcard tool grants`).not.toBe('"*"');
      expect(tools, `${file}: avoid broad wildcard tool grants`).not.toBe("*");
    }
  });

  it("phase entrypoint docs use direct Task as the default, not Agent Teams", () => {
    for (const name of ["research", "requirements", "design", "tasks", "triage"] as const) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const body = readFileSync(file, "utf8");

      expect(body, `${file}: should not describe team dispatch as the default`).not.toMatch(
        /via team|Team Research Phase|Research Team \(multiple parallel teammates\)/,
      );
      expect(body, `${file}: should document direct Task dispatch`).toMatch(
        /direct Task|Direct Task/,
      );
    }
  });

  it("workflow docs no longer describe research teams as the stable default", () => {
    const files = [
      path.join(SKILLS_DIR, "start", "SKILL.md"),
      path.join(SKILLS_DIR, "curdx-core", "SKILL.md"),
      path.join(REFERENCES_DIR, "goal-interview.md"),
      path.join(REFERENCES_DIR, "triage-flow.md"),
      path.join(REFERENCES_DIR, "spec-scanner.md"),
    ];

    for (const file of files) {
      const body = readFileSync(file, "utf8");
      expect(body, `${file}: use direct Task dispatch language instead`).not.toMatch(
        /Research Team|research team|create research team|spawn parallel teammates/,
      );
    }
  });

  it("new spec state defaults use bounded global iterations", () => {
    const startBody = readFileSync(path.join(SKILLS_DIR, "start", "SKILL.md"), "utf8");
    const newBody = readFileSync(path.join(SKILLS_DIR, "new", "SKILL.md"), "utf8");
    const quickModeBody = readFileSync(
      path.join(REFERENCES_DIR, "quick-mode.md"),
      "utf8",
    );

    for (const [label, body] of [
      ["start", startBody],
      ["new", newBody],
      ["quick-mode", quickModeBody],
    ] as const) {
      expect(body, `${label}: expected maxGlobalIterations default 30`).toMatch(
        /maxGlobalIterations["\s:]+30/,
      );
      expect(body, `${label}: must not initialize new state with legacy cap 100`).not.toMatch(
        /maxGlobalIterations["\s:]+100/,
      );
    }
  });

  it("help lists every public slash skill entrypoint", () => {
    const body = readFileSync(path.join(SKILLS_DIR, "help", "SKILL.md"), "utf8");

    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      expect(body, `help missing /curdx-flow:${name}`).toContain(`/curdx-flow:${name}`);
    }
  });

  it("help documents both task and global iteration caps", () => {
    const body = readFileSync(path.join(SKILLS_DIR, "help", "SKILL.md"), "utf8");

    expect(body).toContain(
      "/curdx-flow:implement [--max-task-iterations 5] [--max-global-iterations 30]",
    );
    expect(body).toContain("/curdx-flow:implement --max-global-iterations <n>");
  });

  it("high-frequency entrypoints expose recommended next action behavior", () => {
    const help = readFileSync(path.join(SKILLS_DIR, "help", "SKILL.md"), "utf8");
    const status = readFileSync(path.join(SKILLS_DIR, "status", "SKILL.md"), "utf8");

    expect(help).toContain("Recommended Next Action");
    expect(status).toContain("Recommended next action");
  });

  it("public skills avoid mechanical checklist and human-size label traps", () => {
    const offenders: Array<{ file: string; reason: string }> = [];
    const sizeLabelRe = /\b(?:XS|XL)\b|XS\/S\/M\/L\/XL|S\/M\/L\/XL/;

    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const body = readFileSync(file, "utf8");
      if (body.includes("Create a task for each item")) {
        offenders.push({ file: path.relative(REPO_ROOT, file), reason: "mechanical checklist" });
      }
      if (sizeLabelRe.test(body)) {
        offenders.push({ file: path.relative(REPO_ROOT, file), reason: "human size label" });
      }
    }

    expect(
      offenders,
      `Skill anti-patterns found:\n${offenders
        .map((o) => `  ${o.file}: ${o.reason}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("public entrypoint docs do not suggest un-namespaced legacy slash commands", () => {
    const slashNames = LEGACY_ENTRYPOINT_SKILLS.join("|");
    const bareSlash = new RegExp(
      "(^|[\\s`'\"(])/(?:" + slashNames + ")(?=[\\s`'\"<]|$)",
      "gm",
    );

    const offenders: Array<{ file: string; match: string }> = [];
    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      const file = path.join(SKILLS_DIR, name, "SKILL.md");
      const body = readFileSync(file, "utf8");
      const matches = [...body.matchAll(bareSlash)];
      for (const match of matches) {
        const hit = match[0] ?? "";
        const before = body.slice(Math.max(0, (match.index ?? 0) - 10), match.index ?? 0);
        if (before.endsWith("curdx-flow:")) continue;
        offenders.push({ file: path.relative(REPO_ROOT, file), match: hit });
      }
    }

    expect(
      offenders,
      `Un-namespaced slash commands found:\n${offenders
        .map((o) => `  ${o.file}: ${o.match}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("deprecated skill aliases are hidden from model invocation", () => {
    const file = path.join(SKILLS_DIR, "reality-verification", "SKILL.md");
    const fm = extractFrontmatter(readFileSync(file, "utf8"));
    const fields = parseFrontmatterFields(fm!);

    expect(fields.get("user-invocable")).toBe("false");
    expect(fields.get("disable-model-invocation")).toBe("true");
  });

  it("spec-workflow documents the skills-only entrypoint policy", () => {
    const file = path.join(SKILLS_DIR, "spec-workflow", "SKILL.md");
    const body = readFileSync(file, "utf8");

    expect(body).toContain("Skills-First Architecture");
    expect(body).toContain("skills-only at the plugin surface");
    expect(body).toContain("skills/<name>/SKILL.md");
    expect(body).toContain("references/entrypoints.md");
    expect(body).toContain("references/skill-quality-patterns.md");
  });

  it("workflow skills use the runtime CLI and snapshot contract", () => {
    const files = [
      path.join(SKILLS_DIR, "start", "SKILL.md"),
      path.join(SKILLS_DIR, "status", "SKILL.md"),
      path.join(SKILLS_DIR, "tasks", "SKILL.md"),
      path.join(SKILLS_DIR, "implement", "SKILL.md"),
      path.join(SKILLS_DIR, "curdx-core", "SKILL.md"),
    ];

    for (const file of files) {
      const body = readFileSync(file, "utf8");
      expect(body, `${file}: expected curdx-flow runtime CLI`).toContain("curdx-flow");
    }
    expect(readFileSync(path.join(SKILLS_DIR, "tasks", "SKILL.md"), "utf8")).toContain(
      "Source Coverage Audit",
    );
  });

  it("browser verification policy is wired into planning, execution, and QA surfaces", () => {
    const policy = readFileSync(
      path.join(REFERENCES_DIR, "browser-verification-policy.md"),
      "utf8",
    );
    expect(policy).toContain("Playwright CLI");
    expect(policy).toContain("Chrome DevTools MCP");
    expect(policy).toContain("Do not route browser verification through `/ultrareview`");

    const files = [
      path.join(AGENTS_DIR, "task-planner.md"),
      path.join(AGENTS_DIR, "spec-executor.md"),
      path.join(AGENTS_DIR, "qa-engineer.md"),
      path.join(SKILLS_DIR, "tasks", "SKILL.md"),
      path.join(SKILLS_DIR, "verification-before-completion", "SKILL.md"),
      path.join(SKILLS_DIR, "curdx-core", "SKILL.md"),
      path.join(REFERENCES_DIR, "quality-checkpoints.md"),
      path.join(REFERENCES_DIR, "phase-rules.md"),
    ];

    for (const file of files) {
      const body = readFileSync(file, "utf8");
      expect(body, `${file}: missing browser verification policy link or section`).toMatch(
        /browser-verification-policy\.md|Browser Verify|browser verification readiness/,
      );
    }

    const planner = readFileSync(path.join(AGENTS_DIR, "task-planner.md"), "utf8");
    const executor = readFileSync(path.join(AGENTS_DIR, "spec-executor.md"), "utf8");
    const qa = readFileSync(path.join(AGENTS_DIR, "qa-engineer.md"), "utf8");
    for (const [label, body] of [
      ["task-planner", planner],
      ["spec-executor", executor],
      ["qa-engineer", qa],
    ] as const) {
      expect(body, `${label}: should prefer Playwright for repeatable E2E`).toContain(
        "Playwright",
      );
      expect(body, `${label}: should name Chrome DevTools MCP for high-fidelity browser proof`).toContain(
        "Chrome DevTools MCP",
      );
    }
  });

  it("start quick path preserves machine-readable task format", () => {
    const body = readFileSync(path.join(SKILLS_DIR, "start", "SKILL.md"), "utf8");

    expect(body).toContain("Quick Artifact Contract");
    expect(body).toContain("## Source Coverage Audit");
    expect(body).toContain("- [ ] 1.1");
    expect(body).toContain("Do not create heading-only task sections");
    expect(body).toContain("empty-tasks");
  });

  it("start writes the active spec marker under the default specs directory", () => {
    const body = readFileSync(path.join(SKILLS_DIR, "start", "SKILL.md"), "utf8");

    expect(body).toContain("$defaultDir/.current-spec");
    expect(body).toContain('> "$defaultDir/.current-spec"');
    expect(body).toContain("Do not write a project-root `.current-spec`");
  });

  it("plugin-facing workflow docs do not expose legacy helper entrypoints", () => {
    const legacyPatterns = [
      /\bcurdx_find_spec\b/,
      /\bcurdx_resolve_current\b/,
      /\bcurdx_get_specs_dirs\b/,
      /\bcurdx_get_default_dir\b/,
      /\bcurdx_list_specs\b/,
      /hooks\/scripts\/lib\/(?:smart-route|auto-policy|merge-state|count-tasks)\.mjs/,
      /\b(?:smart-route|auto-policy|merge-state|count-tasks)\.mjs\b/,
    ];
    const files = [
      ...SKILL_FILES,
      ...AGENT_FILES,
      ...listMarkdown(REFERENCES_DIR),
    ];
    const offenders: Array<{ file: string; match: string }> = [];

    for (const file of files) {
      const body = readFileSync(file, "utf8");
      for (const pattern of legacyPatterns) {
        const match = body.match(pattern);
        if (match) {
          offenders.push({
            file: path.relative(REPO_ROOT, file),
            match: match[0],
          });
        }
      }
    }

    expect(
      offenders,
      `Legacy workflow helper references found:\n${offenders
        .map((o) => `  ${o.file}: ${o.match}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});

describe("references/ link integrity", () => {
  it("every references/<name>.md in agents resolves under plugin/references/", () => {
    const broken: Array<{ source: string; target: string }> = [];
    for (const file of AGENT_FILES) {
      const body = readFileSync(file, "utf8");
      for (const refName of findReferenceNames(body)) {
        const refPath = path.join(REFERENCES_DIR, `${refName}.md`);
        if (!existsSync(refPath)) {
          broken.push({
            source: path.relative(REPO_ROOT, file),
            target: `references/${refName}.md`,
          });
        }
      }
    }
    expect(
      broken,
      `Broken agent reference links found:\n${broken
        .map((b) => `  ${b.source} -> ${b.target}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("every references/<name>.md in a skill resolves locally or via plugin global references", () => {
    const broken: Array<{ source: string; target: string }> = [];
    for (const file of SKILL_FILES) {
      const body = readFileSync(file, "utf8");
      const skillRefDir = path.join(path.dirname(file), "references");
      for (const refName of findReferenceNames(body)) {
        const localPath = path.join(skillRefDir, `${refName}.md`);
        const pluginPath = path.join(REFERENCES_DIR, `${refName}.md`);
        if (!existsSync(localPath) && !existsSync(pluginPath)) {
          broken.push({
            source: path.relative(REPO_ROOT, file),
            target: `references/${refName}.md`,
          });
        }
      }
    }
    expect(
      broken,
      `Broken skill reference links found:\n${broken
        .map((b) => `  ${b.source} -> ${b.target}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
