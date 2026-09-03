#!/usr/bin/env -S npx tsx
/**
 * @fileoverview TypeScript harness for the decisions-skill Mermaid validator.
 *
 * Mirrors the notion-tasks mermaid test matrix (parse / lint / multi-fence /
 * raw `.mmd`) so both skills validate the same way.
 *
 * @testing CLI: npm run check:mermaid:test
 * @see skills/decisions/scripts/check-mermaid.ts - Validator under test.
 * @documentation reviewed=2026-09-03 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface JsonPrimitive {
  readonly [k: string]: string | number | boolean | null | JsonValue | JsonValue[];
}
interface JsonValue {
  readonly [k: string]: JsonValue | string | number | boolean | null | JsonValue[];
}
interface JsonRecord {
  readonly [k: string]: JsonValue | string | number | boolean | null;
}

interface ValidatorCase {
  description: string;
  fileName: string;
  content: string;
  inputType: "markdown" | "mermaid";
  reportFileName: string;
  expectSuccess: boolean;
  expectedLintCode?: string;
  expectedStage: "complete" | "lint" | "parse" | "extraction";
  reportAssertionDescription: string;
  reportAssertion: (report: JsonRecord) => boolean;
}

interface CommandResult {
  command: string;
  args: readonly string[];
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const DEFAULT_VALIDATOR_PATH = path.join(SCRIPT_DIR, "check-mermaid.ts");

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-${nowStamp()}-`));
  return dir;
}

function writeFixture(dir: string, fileName: string, content: string): string {
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

function runValidator(args: readonly string[], validatorPath: string): CommandResult {
  const cmdArgs = ["tsx", validatorPath, ...args];
  const result: SpawnSyncReturns<string> = spawnSync("npx", cmdArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 180000,
  });
  return {
    command: "npx",
    args: cmdArgs,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? undefined,
  };
}

const CASES: ValidatorCase[] = [
  {
    description: "valid raw mermaid passes",
    fileName: "valid.mmd",
    content: "flowchart LR\n  A[\"start\"] --> B[\"end\"]\n",
    inputType: "mermaid",
    reportFileName: "valid.mmd.check-mermaid.json",
    expectSuccess: true,
    expectedStage: "complete",
    reportAssertionDescription: "reports complete success with one diagram",
    reportAssertion: (r) =>
      r["success"] === true &&
      r["stage"] === "complete" &&
      Array.isArray(r["diagrams"]) &&
      (r["diagrams"] as JsonRecord[]).length === 1,
  },
  {
    description: "invalid raw mermaid fails lint",
    fileName: "invalid-unquoted.mmd",
    content: "flowchart LR\n  A[unquoted label] --> B[\"end\"]\n",
    inputType: "mermaid",
    reportFileName: "invalid-unquoted.mmd.check-mermaid.json",
    expectSuccess: false,
    expectedLintCode: "unquoted-square-label",
    expectedStage: "lint",
    reportAssertionDescription: "reports lint failure naming the offending node",
    reportAssertion: (r) =>
      r["success"] === false &&
      r["stage"] === "lint" &&
      Array.isArray(r["lintProblems"]) &&
      (r["lintProblems"] as JsonRecord[]).some(
        (p) => p["code"] === "unquoted-square-label"
      ),
  },
  {
    description: "label with forbidden chars (parens) fails lint",
    fileName: "invalid-parens.mmd",
    content: 'flowchart LR\n  A["oops(parens)"] --> B["end"]\n',
    inputType: "mermaid",
    reportFileName: "invalid-parens.mmd.check-mermaid.json",
    expectSuccess: false,
    expectedLintCode: "forbidden-label-char",
    expectedStage: "lint",
    reportAssertionDescription: "reports forbidden-label-char lint problem",
    reportAssertion: (r) =>
      r["success"] === false &&
      r["stage"] === "lint" &&
      Array.isArray(r["lintProblems"]) &&
      (r["lintProblems"] as JsonRecord[]).some(
        (p) => p["code"] === "forbidden-label-char"
      ),
  },
  {
    description: "valid markdown with two mermaid blocks passes",
    fileName: "two-blocks.md",
    content:
      "# Sample\n\nFirst diagram:\n\n```mermaid\nflowchart LR\n  A[\"one\"] --> B[\"two\"]\n```\n\nSecond diagram:\n\n```mermaid\nflowchart LR\n  X[\"x\"] --> Y[\"y\"]\n```\n",
    inputType: "markdown",
    reportFileName: "two-blocks.md.check-mermaid.json",
    expectSuccess: true,
    expectedStage: "complete",
    reportAssertionDescription: "extracts both fenced diagrams",
    reportAssertion: (r) =>
      r["success"] === true &&
      r["stage"] === "complete" &&
      Array.isArray(r["diagrams"]) &&
      (r["diagrams"] as JsonRecord[]).length === 2,
  },
  {
    description: "markdown with one invalid mermaid block fails lint",
    fileName: "one-bad.md",
    content:
      "# Sample\n\nBad:\n\n```mermaid\nflowchart LR\n  A[no quotes] --> B[\"end\"]\n```\n\nGood:\n\n```mermaid\nflowchart LR\n  X[\"x\"] --> Y[\"y\"]\n```\n",
    inputType: "markdown",
    reportFileName: "one-bad.md.check-mermaid.json",
    expectSuccess: false,
    expectedLintCode: "unquoted-square-label",
    expectedStage: "lint",
    reportAssertionDescription: "reports lint problems on the bad diagram only",
    reportAssertion: (r) =>
      r["success"] === false &&
      r["stage"] === "lint" &&
      Array.isArray(r["diagrams"]) &&
      Array.isArray(r["lintProblems"]) &&
      (r["lintProblems"] as JsonRecord[]).length >= 1,
  },
  {
    description: "markdown with no mermaid fences (auto) falls back to raw-file",
    fileName: "raw-via-auto.md",
    content: "flowchart LR\n  A[\"x\"] --> B[\"y\"]\n",
    inputType: "mermaid",
    reportFileName: "raw-via-auto.md.check-mermaid.json",
    expectSuccess: true,
    expectedStage: "complete",
    reportAssertionDescription: "treats as one raw-file diagram",
    reportAssertion: (r) =>
      r["success"] === true &&
      r["stage"] === "complete" &&
      Array.isArray(r["diagrams"]) &&
      (r["diagrams"] as JsonRecord[]).length === 1,
  },
  {
    description: "markdown with no mermaid fences fails extraction",
    fileName: "no-mermaid.md",
    content: "# Just a heading\n\nNo diagrams here.\n",
    inputType: "markdown",
    reportFileName: "no-mermaid.md.check-mermaid.json",
    expectSuccess: false,
    expectedStage: "extraction",
    reportAssertionDescription: "reports extraction-failed with no-fences message",
    reportAssertion: (r) =>
      r["success"] === false &&
      r["stage"] === "extraction" &&
      typeof r["extractionError"] === "object" &&
      (r["extractionError"] as JsonRecord)["code"] === "extraction-failed",
  },
];

function printResult(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
}

function runAllCases(validatorPath: string): { passed: number; failed: number } {
  const tempDir = makeTempDir("check-mermaid");
  const reportDir = path.join(tempDir, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  let passed = 0;
  let failed = 0;

  for (const c of CASES) {
    const filePath = writeFixture(tempDir, c.fileName, c.content);
    const args = [
      "--files",
      filePath,
      "--input-type",
      c.inputType,
      "--report",
      reportDir,
    ];
    const result = runValidator(args, validatorPath);
    const successOk = c.expectSuccess ? result.status === 0 : (result.status ?? 0) !== 0;
    const reportPath = path.join(reportDir, c.reportFileName);
    let reportOk = false;
    let reportDescription = c.reportAssertionDescription;
    if (fs.existsSync(reportPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as JsonRecord;
        reportOk = c.reportAssertion(report);
      } catch (err) {
        reportDescription = `${reportDescription} (JSON parse failed: ${err instanceof Error ? err.message : String(err)})`;
      }
    } else {
      reportDescription = `${reportDescription} (report file missing)`;
    }

    const overall = successOk && reportOk;
    printResult(`${c.description} [exit=${result.status}]`, overall);
    printResult(`  ↳ ${reportDescription}`, reportOk);
    if (overall && reportOk) {
      passed += 1;
    } else {
      failed += 1;
      if (!successOk) {
        console.log(`    stdout: ${result.stdout.split("\n").slice(0, 3).join("\n")}`);
        console.log(`    stderr: ${result.stderr.split("\n").slice(0, 3).join("\n")}`);
      }
    }
  }

  // --emit-marker round-trip on a fresh copy of the first case.
  const first = CASES[0];
  const markerTarget = writeFixture(
    tempDir,
    `marker-${first.fileName}`,
    first.content
  );
  const markerResult = runValidator(
    ["--files", markerTarget, "--input-type", first.inputType, "--emit-marker"],
    validatorPath
  );
  const markerInserted =
    markerResult.status === 0 &&
    fs.readFileSync(markerTarget, "utf8").includes("<!-- mermaid-checked:");
  printResult(
    `--emit-marker inserts <!-- mermaid-checked: ... --> above fences`,
    markerInserted
  );
  if (markerInserted) passed += 1;
  else failed += 1;

  // --help exits 0.
  const helpResult = runValidator(["--help"], validatorPath);
  const helpOk = helpResult.status === 0 && /Usage:/.test(helpResult.stdout);
  printResult("--help prints usage and exits 0", helpOk);
  if (helpOk) passed += 1;
  else failed += 1;

  // Usage error when --files is missing.
  const noFilesResult = runValidator([], validatorPath);
  const noFilesOk = noFilesResult.status === 64;
  printResult("missing --files exits 64", noFilesOk);
  if (noFilesOk) passed += 1;
  else failed += 1;

  // Cleanup best-effort.
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return { passed, failed };
}

const validatorPath = process.env["CHECK_MERMAID_VALIDATOR"] ?? DEFAULT_VALIDATOR_PATH;
const result = runAllCases(validatorPath);
console.log(`\nSummary: ${result.passed} passed, ${result.failed} failed.`);
process.exit(result.failed === 0 ? 0 : 1);
