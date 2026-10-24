// Recomputes the `status` of every docs/compatibility.json entry from the code, and renders
// docs/compatibility.md. Run after changing the Caddy API or the oracle suites:
//
//   node reference/build123d/scripts/compatibility-status.ts [--check]
//
// Status rules (never hand-edited, so the inventory cannot drift from the code):
//   excluded    kept as curated (deliberately out of scope)
//   planned     the Caddy name does not resolve at runtime
//   implemented the Caddy name resolves (exported class/function, prototype or static member)
//   tested      ...and its identifier appears in packages/caddy/tests
//   validated   ...and it appears in a test module asserting build123d fixtures, while the
//               build123d identifier appears in an oracle case module
//               (reference/build123d/cases/*.py); operators (`__add__`, ...) are spelled
//               as symbols in Python, so for them the Caddy-side oracle mention suffices

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import * as caddy from "../../../packages/caddy/src/index.ts";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const INVENTORY = join(ROOT, "docs", "compatibility.json");
const SUMMARY = join(ROOT, "docs", "compatibility.md");
const CASES = join(ROOT, "reference", "build123d", "cases");
const FIXTURES = join(ROOT, "reference", "build123d", "fixtures");
const TESTS = join(ROOT, "packages", "caddy", "tests");
const SOURCES = join(ROOT, "packages", "caddy", "src");

type Status = "excluded" | "planned" | "implemented" | "tested" | "validated";

interface Entry {
    python: string;
    kind: string;
    caddy: string | null;
    capability: string;
    status: Status;
}

function filesUnder(dir: string, extension: string): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith(extension))
        .map(entry => join(entry.parentPath, entry.name));
}

function corpus(files: string[]): string {
    return files.map(file => readFileSync(file, "utf8")).join("\n");
}

function mentions(text: string, identifier: string): boolean {
    return new RegExp(`\\b${identifier.replace(/[$]/g, "\\$")}\\b`).test(text);
}

function exported(name: string): unknown {
    return Reflect.get(caddy, name);
}

// Inventory entries may carry a call sketch, e.g. `export(shape, { name, type })`; only the
// leading `Owner`, `Owner#member` or `Owner.member` names the API.
const API_NAME = /^([A-Za-z_$][\w$]*)(?:([#.])([A-Za-z_$][\w$]*))?/;

/** Resolves `Name`, `Name#member` or `Name.member` against the runtime package. */
function resolves(caddyName: string, sources: readonly string[]): boolean {
    let [, owner = "", separator, member] = API_NAME.exec(caddyName) ?? [];
    let value = exported(owner);
    if (member === undefined) {
        return (
            value !== undefined ||
            sources.some(source => new RegExp(`export (type|interface) ${owner}\\b`).test(source))
        );
    }
    if (separator === "." && typeof value === "object" && value !== null) return member in value;
    if (typeof value !== "function") return false;
    let target: unknown = separator === "#" ? value.prototype : value;
    if ((typeof target === "object" && target !== null) || typeof target === "function") {
        if (member in target) return true;
    }
    if (separator !== "#") return false;
    // Instance fields live on objects, not the prototype: accept a field declared in the source
    // file of the class or one of its ancestors.
    let field = new RegExp(`^\\s+(readonly\\s+)?${member}[?!]?:`, "m");
    return classChain(value).some(name =>
        sources.some(
            source => new RegExp(`\\bclass ${name}\\b`).test(source) && field.test(source),
        ),
    );
}

/** Names of a class and its ancestors, nearest first. */
function classChain(constructor: Function): string[] {
    let names: string[] = [];
    for (
        let current: unknown = constructor;
        typeof current === "function" && current.name !== "";
    ) {
        names.push(current.name);
        current = Object.getPrototypeOf(current);
    }
    return names;
}

interface Corpora {
    readonly tests: string;
    /** Test modules that assert build123d fixtures. */
    readonly oracleTests: string;
    readonly cases: string;
    readonly sources: readonly string[];
}

function status(entry: Entry, corpora: Corpora): Status {
    if (entry.status === "excluded") return "excluded";
    if (entry.caddy === null || !resolves(entry.caddy, corpora.sources)) return "planned";
    let [, owner = "", , member] = API_NAME.exec(entry.caddy) ?? [];
    let caddyIdentifier = member ?? owner;
    if (!mentions(corpora.tests, caddyIdentifier)) return "implemented";
    if (!mentions(corpora.oracleTests, caddyIdentifier)) return "tested";
    let pythonIdentifier = entry.python.split(".").at(-1) ?? entry.python;
    let isOperator = pythonIdentifier.startsWith("__") && pythonIdentifier.endsWith("__");
    return isOperator || mentions(corpora.cases, pythonIdentifier) ? "validated" : "tested";
}

/** Whether a test module compares against build123d fixtures (it imports the oracle harness). */
function assertsFixtures(source: string): boolean {
    return /build123d\/oracle\.ts|oracleSuite|FixtureCase|OracleCases/.test(source);
}

function suiteCounts(): [string, number][] {
    return readdirSync(FIXTURES)
        .filter(file => file.endsWith(".json") && file !== "selftest.json")
        .map(file => {
            let fixture: unknown = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
            let cases =
                typeof fixture === "object" && fixture !== null && "cases" in fixture
                    ? fixture.cases
                    : {};
            return [file.replace(".json", ""), Object.keys(cases ?? {}).length] as [string, number];
        });
}

function render(entries: Entry[]): string {
    let statuses: Status[] = ["validated", "tested", "implemented", "planned", "excluded"];
    let capabilities = [...new Set(entries.map(entry => entry.capability))].sort();
    let count = (filter: (entry: Entry) => boolean) => entries.filter(filter).length;
    let lines = [
        "# Compatibility with build123d 0.13.0",
        "",
        "Generated by `node reference/build123d/scripts/compatibility-status.ts` from `docs/compatibility.json` and the code; do not edit. Statuses are computed: **implemented** means the Caddy name resolves at runtime, **tested** that Caddy tests mention it, **validated** that it is also exercised by a test asserting build123d fixtures (`reference/build123d/cases`). Builder-context machinery is **excluded** by design.",
        "",
        `| Capability | ${statuses.join(" | ")} | total |`,
        `| --- | ${statuses.map(() => "---").join(" | ")} | --- |`,
    ];
    for (let capability of capabilities) {
        let row = statuses.map(s => count(e => e.capability === capability && e.status === s));
        lines.push(
            `| ${capability} | ${row.join(" | ")} | ${count(e => e.capability === capability)} |`,
        );
    }
    lines.push(
        `| **all** | ${statuses.map(s => count(e => e.status === s)).join(" | ")} | ${entries.length} |`,
        "",
    );
    lines.push("## Oracle suites", "", "| Suite | Cases |", "| --- | --- |");
    for (let [suite, cases] of suiteCounts()) lines.push(`| ${suite} | ${cases} |`);
    lines.push("", "## Not yet implemented", "");
    for (let capability of capabilities) {
        let missing = entries.filter(e => e.capability === capability && e.status === "planned");
        if (missing.length > 0)
            lines.push(`- **${capability}**: ${missing.map(e => `\`${e.python}\``).join(", ")}`);
    }
    return `${lines.join("\n")}\n`;
}

function isInventory(value: unknown): value is { entries: Entry[] } & Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        "entries" in value &&
        Array.isArray(value.entries)
    );
}

function main(): void {
    let parsed: unknown = JSON.parse(readFileSync(INVENTORY, "utf8"));
    if (!isInventory(parsed)) throw new Error("docs/compatibility.json has no entries array");
    let inventory = parsed;
    let testFiles = filesUnder(TESTS, ".ts").map(file => readFileSync(file, "utf8"));
    let corpora: Corpora = {
        tests: testFiles.join("\n"),
        oracleTests: testFiles.filter(assertsFixtures).join("\n"),
        cases: corpus(filesUnder(CASES, ".py").filter(file => !file.endsWith("selftest.py"))),
        sources: filesUnder(SOURCES, ".ts").map(file => readFileSync(file, "utf8")),
    };
    let entries = inventory.entries.map(entry => ({
        ...entry,
        status: status(entry, corpora),
    }));
    let json = `${JSON.stringify({ ...inventory, entries }, null, 4)}\n`;
    let markdown = render(entries);
    if (process.argv.includes("--check")) {
        let drift =
            readFileSync(INVENTORY, "utf8") !== json || readFileSync(SUMMARY, "utf8") !== markdown;
        if (drift) throw new Error("compatibility docs are stale; rerun compatibility-status.ts");
        return;
    }
    writeFileSync(INVENTORY, json);
    writeFileSync(SUMMARY, markdown);
    console.log(
        render(entries)
            .split("\n")
            .slice(4, 6 + 12)
            .join("\n"),
    );
}

main();
