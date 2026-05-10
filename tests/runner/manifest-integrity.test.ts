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
const AGENTS_DIR = path.join(PLUGIN_ROOT, "agents");
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");
const REFERENCES_DIR = path.join(PLUGIN_ROOT, "references");
const HOOKS_CONFIG = path.join(PLUGIN_ROOT, "hooks", "hooks.json");

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
    };

    expect(manifest.name).toBe("curdx-flow");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(manifest.homepage).toMatch(/^https:\/\/github\.com\/curdx\/curdx-flow/);
    expect(manifest.repository).toBe("https://github.com/curdx/curdx-flow");
    expect(manifest.license).toBe("MIT");
    expect(manifest.commands, "commands must not be declared after skills-only migration").toBeUndefined();

    for (const key of ["skills", "agents", "hooks"] as const) {
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

  it("help lists every public slash skill entrypoint", () => {
    const body = readFileSync(path.join(SKILLS_DIR, "help", "SKILL.md"), "utf8");

    for (const name of LEGACY_ENTRYPOINT_SKILLS) {
      expect(body, `help missing /curdx-flow:${name}`).toContain(`/curdx-flow:${name}`);
    }
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
