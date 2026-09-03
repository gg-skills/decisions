#!/usr/bin/env -S npx tsx
/**
 * @fileoverview Decisions-skill Mermaid validator.
 *
 * Validates ```mermaid fenced diagrams (and raw `.mmd` files) against the
 * pinned `@mermaid-js/mermaid-cli@11.12.0` renderer and enforces the
 * flowchart-strict lint rules (quoted square-bracket labels, no parens /
 * colons / backticks inside labels, header must be `flowchart` or `graph`).
 *
 * Surfaces a structured JSON report via `--report <path>` and a human-
 * readable summary on stdout. Exit codes: 0 success, 1 lint failure,
 * 2 parse failure, 3 mmdc crash, 64 usage error.
 *
 * The agent should run this after writing a decision packet and then
 * insert `<!-- mermaid-checked: <iso> diagrams=<n> exit=<n> -->` markers
 * above each ```mermaid fence for the completeness checker to find.
 *
 * @testing CLI: npm run check:mermaid -- --files <packet.md>
 * @testing CLI: npx tsx .agents/skills/decisions/scripts/check-mermaid.ts --help
 * @see skills/notion-tasks/scripts/validate-mermaid.ts - reference validator
 *      whose structure this script intentionally mirrors to keep both
 *      surfaces close in shape.
 * @documentation reviewed=2026-09-03 standard=FILE_OVERVIEW_STANDARDS_TYPESCRIPT@3
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";

// ============================================================================
// Constants
// ============================================================================

const PINNED_MERMAID_CLI = "@mermaid-js/mermaid-cli@11.12.0";
const DEFAULT_PROFILE = "flowchart-strict";
const SUPPORTED_PROFILES = ["flowchart-strict"] as const;
const SUPPORTED_INPUT_TYPES = ["auto", "markdown", "mermaid"] as const;
const DEFAULT_STALENESS_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Types
// ============================================================================

type InputType = (typeof SUPPORTED_INPUT_TYPES)[number];
type ResolvedInputType = "markdown" | "mermaid";
type SourceKind = "markdown-fence" | "raw-file";

interface LintProblem {
  line: number;
  code: string;
  message: string;
  snippet?: string;
  suggestion?: string;
}

interface DiagramChunk {
  diagramIndex: number;
  sourceKind: SourceKind;
  content: string;
  startLine: number;
}

interface ParsedArgs {
  files: string[];
  profile: string;
  reportPath: string;
  inputType: InputType;
  emitMarker: boolean;
}

interface ParseResult {
  ok: boolean;
  status: number | null;
  signal: NodeJS.Signals | null;
  outputSize: number;
  logs: string;
}

interface BaseReport {
  file: string;
  profile: string;
  inputTypeRequested: InputType;
  inputTypeResolved: ResolvedInputType;
  pinnedMermaidCli: string;
  sha256: string;
  generatedAt: string;
}

interface DiagramReport {
  diagramIndex: number;
  sourceKind: SourceKind;
  startLine: number;
  sha256: string;
  lintProblems: LintProblem[];
  parse?: ParseResult;
}

type ReportPayload =
  | (BaseReport & {
      success: false;
      stage: "extraction";
      extractionError: LintProblem;
    })
  | (BaseReport & {
      success: false;
      stage: "lint";
      diagrams: DiagramReport[];
      lintProblems: LintProblem[];
    })
  | (BaseReport & {
      success: false;
      stage: "parse";
      diagrams: DiagramReport[];
    })
  | (BaseReport & {
      success: true;
      stage: "complete";
      diagrams: DiagramReport[];
    });

interface FileOutcome {
  file: string;
  success: boolean;
  exitCode: number;
  stage: "complete" | "lint" | "parse" | "extraction" | "usage";
  report: ReportPayload;
}

// ============================================================================
// CLI usage and arg parsing
// ============================================================================

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  check-mermaid.ts --files <file1> [<file2> ...] [options]",
      "",
      "Options:",
      "  --files <path>        Markdown or .mmd file(s) to validate (required, repeatable)",
      "  --report <path>       Write per-file JSON reports to <path>/<basename>.json",
      "  --input-type <kind>   auto | markdown | mermaid (default: auto)",
      "  --profile <name>      Lint profile (default: flowchart-strict)",
      "  --emit-marker         Insert <!-- mermaid-checked: ... --> markers above",
      "                        each validated fence when validation succeeds",
      "  --help                Show this help and exit",
      "",
      "Profiles:",
      "  flowchart-strict      Enforces quoted node labels and flowchart/graph headers",
      "",
      "Input type:",
      "  auto      Use markdown fence extraction when mermaid fences exist,",
      "            otherwise treat the file as a single raw mermaid document",
      "  markdown  Validate every ```mermaid fenced block in the file",
      "  mermaid   Validate the entire file as one mermaid document",
      "",
      "Exit codes:",
      "  0   All diagrams passed",
      "  1   One or more diagrams failed lint",
      "  2   One or more diagrams failed mmdc parse",
      "  3   mmdc crashed (signal, timeout, missing chromium)",
      "  64  CLI usage error",
    ].join("\n")
  );
}

function isInputType(value: string): value is InputType {
  return (SUPPORTED_INPUT_TYPES as readonly string[]).includes(value);
}

function isSupportedProfile(value: string): value is (typeof SUPPORTED_PROFILES)[number] {
  return (SUPPORTED_PROFILES as readonly string[]).includes(value);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const files: string[] = [];
  let profile = DEFAULT_PROFILE;
  let reportPath = "";
  let inputType: InputType = "auto";
  let emitMarker = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (
      arg === "--files" ||
      arg === "--report" ||
      arg === "--input-type" ||
      arg === "--profile"
    ) {
      const value = args[i + 1] ?? "";
      if (!value || value.startsWith("-")) {
        console.error(`Missing value for ${arg}.`);
        process.exit(64);
      }
      if (arg === "--files") {
        files.push(value);
      } else if (arg === "--report") {
        reportPath = value;
      } else if (arg === "--input-type") {
        if (!isInputType(value)) {
          console.error(`Unsupported input type '${value}'.`);
          process.exit(64);
        }
        inputType = value;
      } else {
        if (!isSupportedProfile(value)) {
          console.error(
            `Unsupported profile '${value}'. Supported: ${SUPPORTED_PROFILES.join(", ")}.`
          );
          process.exit(64);
        }
        profile = value;
      }
      i += 1;
      continue;
    }

    if (arg === "--emit-marker") {
      emitMarker = true;
      continue;
    }

    if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(64);
    }

    // Tolerate positional file paths for agents that drop the --files flag.
    files.push(arg);
  }

  if (files.length === 0) {
    console.error("At least one --files <path> argument is required.");
    printUsage();
    process.exit(64);
  }

  return { files, profile, reportPath, inputType, emitMarker };
}

// ============================================================================
// Extraction helpers
// ============================================================================

function countLinesBeforeIndex(content: string, index: number): number {
  if (index <= 0) return 1;
  return content.slice(0, index).split(/\r?\n/).length;
}

function extractMermaidFencedBlocks(content: string): DiagramChunk[] {
  const chunks: DiagramChunk[] = [];
  const fenceRegex = /^```[ \t]*mermaid[^\n\r]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const blockContent = match[1] ?? "";
    const firstLineBreakIndex = fullMatch.indexOf("\n");
    const contentStartIndex = (match.index ?? 0) + firstLineBreakIndex + 1;
    const startLine = countLinesBeforeIndex(content, contentStartIndex);
    chunks.push({
      diagramIndex: chunks.length + 1,
      sourceKind: "markdown-fence",
      content: blockContent,
      startLine,
    });
  }

  return chunks;
}

function extractDiagrams(
  content: string,
  inputType: InputType
): { resolvedInputType: ResolvedInputType; diagrams: DiagramChunk[] } {
  const fenced = extractMermaidFencedBlocks(content);

  if (inputType === "markdown") {
    if (fenced.length === 0) {
      throw new Error("No ```mermaid fences found in markdown input.");
    }
    return { resolvedInputType: "markdown", diagrams: fenced };
  }
  if (inputType === "mermaid") {
    return {
      resolvedInputType: "mermaid",
      diagrams: [
        { diagramIndex: 1, sourceKind: "raw-file", content, startLine: 1 },
      ],
    };
  }
  if (fenced.length > 0) {
    return { resolvedInputType: "markdown", diagrams: fenced };
  }
  return {
    resolvedInputType: "mermaid",
    diagrams: [
      { diagramIndex: 1, sourceKind: "raw-file", content, startLine: 1 },
    ],
  };
}

// ============================================================================
// Lint
// ============================================================================

function firstNonEmptyLine(
  lines: string[]
): { index: number; value: string } {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== "") {
      return { index: i, value: lines[i].trim() };
    }
  }
  return { index: -1, value: "" };
}

function escapeMermaidLabel(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function lintFlowchartStrict(
  content: string,
  startLineOffset = 0
): LintProblem[] {
  const problems: LintProblem[] = [];
  const lines = content.split(/\r?\n/);
  const first = firstNonEmptyLine(lines);

  if (first.index === -1) {
    problems.push({
      line: startLineOffset + 1,
      code: "empty-diagram",
      message: "Mermaid diagram is empty.",
    });
    return problems;
  }

  if (!/^(flowchart|graph)\b/.test(first.value)) {
    problems.push({
      line: startLineOffset + first.index + 1,
      code: "header-not-flowchart",
      message: "First non-empty line must start with 'flowchart' or 'graph'.",
    });
  }

  const squareLabelPattern = /\b([A-Za-z][A-Za-z0-9_]*)\[(.*?)\]/g;
  const forbiddenCharPattern = /[():`]/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith("%%")) {
      continue;
    }

    let match: RegExpExecArray | null;
    while ((match = squareLabelPattern.exec(line)) !== null) {
      const nodeId = match[1] ?? "";
      const label = (match[2] ?? "").trim();
      const isQuoted =
        label.startsWith('"') && label.endsWith('"') && label.length >= 2;
      if (!isQuoted) {
        problems.push({
          line: startLineOffset + i + 1,
          code: "unquoted-square-label",
          message: `Node '${nodeId}' uses unquoted [label]. Use ${nodeId}["..."] syntax.`,
          snippet: match[0],
          suggestion: `${nodeId}["${escapeMermaidLabel(label)}"]`,
        });
        continue;
      }
      const inner = label.slice(1, -1);
      if (forbiddenCharPattern.test(inner)) {
        problems.push({
          line: startLineOffset + i + 1,
          code: "forbidden-label-char",
          message: `Node '${nodeId}' label contains '(', ')', ':', or backtick. Escape or remove.`,
          snippet: match[0],
          suggestion: `${nodeId}["${escapeMermaidLabel(inner.replace(/[():`]/g, " "))}"]`,
        });
      }
    }
  }

  return problems;
}

// ============================================================================
// mmdc invocation
// ============================================================================

function runPinnedMermaidParse(inputFile: string): ParseResult {
  const tmpOut = path.join(
    os.tmpdir(),
    `mermaid-check-${crypto.randomUUID()}.svg`
  );

  const cmdArgs = ["-y", PINNED_MERMAID_CLI, "-i", inputFile, "-o", tmpOut];
  const result: SpawnSyncReturns<string> = spawnSync("npx", cmdArgs, {
    encoding: "utf8",
    timeout: 120000,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = `${stdout}\n${stderr}`.trim();

  const outputExists = fs.existsSync(tmpOut);
  const outputSize = outputExists ? fs.statSync(tmpOut).size : 0;

  if (outputExists) {
    fs.rmSync(tmpOut, { force: true });
  }

  const ok = result.status === 0 && outputSize > 0;
  return {
    ok,
    status: result.status,
    signal: result.signal,
    outputSize,
    logs: combined,
  };
}

function runPinnedMermaidParseFromContent(content: string): ParseResult {
  const tmpIn = path.join(
    os.tmpdir(),
    `mermaid-check-${crypto.randomUUID()}.mmd`
  );
  fs.writeFileSync(tmpIn, content, "utf8");
  const parse = runPinnedMermaidParse(tmpIn);
  fs.rmSync(tmpIn, { force: true });
  return parse;
}

// ============================================================================
// Reporting
// ============================================================================

function sha256Of(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function formatProblems(problems: LintProblem[]): string {
  return problems
    .map((p) => {
      const parts = [`line ${p.line}`, p.code, p.message];
      if (p.snippet) parts.push(`snippet: ${p.snippet}`);
      if (p.suggestion) parts.push(`suggestion: ${p.suggestion}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

function writeReport(report: ReportPayload, reportPath: string): void {
  fs.mkdirSync(reportPath, { recursive: true });
  const baseName = path.basename(report.file).replace(/[^\w.-]/g, "_");
  const outPath = path.join(reportPath, `${baseName}.check-mermaid.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
}

// ============================================================================
// Marker insertion
// ============================================================================

function emitMarkersForFile(
  filePath: string,
  outcome: FileOutcome,
  now: string
): void {
  if (!outcome.success) {
    return;
  }
  if (outcome.report.stage !== "complete") {
    return;
  }
  const original = fs.readFileSync(filePath, "utf8");
  const lines = original.split(/\r?\n/);

  // Walk fences from bottom up so prior line insertions don't shift indices.
  const fenceRegex = /^```[ \t]*mermaid[^\n\r]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;
  const fenceMatches: { startLine: number; endLine: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRegex.exec(original)) !== null) {
    const fullMatch = m[0];
    const startLine = countLinesBeforeIndex(original, m.index ?? 0);
    const endLine = startLine + fullMatch.split(/\r?\n/).length - 1;
    fenceMatches.push({ startLine, endLine });
  }

  if (fenceMatches.length === 0) {
    // Raw `.mmd` file or auto-resolved raw: insert a single marker at the top.
    const marker = `<!-- mermaid-checked: ${now} diagrams=1 exit=0 -->`;
    if (lines[0]?.trim() !== marker) {
      lines.unshift(marker);
    }
  } else {
    // Walk bottom-up so insertions don't shift earlier line numbers.
    for (let i = fenceMatches.length - 1; i >= 0; i -= 1) {
      const fence = fenceMatches[i];
      const marker = `<!-- mermaid-checked: ${now} diagrams=${fenceMatches.length} exit=0 -->`;
      // Idempotency: skip if the immediately preceding line is already a marker.
      if (lines[fence.startLine - 2]?.trim() === marker.trim()) {
        continue;
      }
      lines.splice(fence.startLine - 1, 0, marker);
    }
  }

  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

// ============================================================================
// Per-file validation
// ============================================================================

function validateFile(filePath: string, parsed: ParsedArgs): FileOutcome {
  if (!fs.existsSync(filePath)) {
    const extractionError: LintProblem = {
      line: 0,
      code: "file-not-found",
      message: `File not found: ${filePath}`,
    };
    const report: ReportPayload = {
      file: filePath,
      profile: parsed.profile,
      inputTypeRequested: parsed.inputType,
      inputTypeResolved: "markdown",
      pinnedMermaidCli: PINNED_MERMAID_CLI,
      sha256: "",
      generatedAt: new Date().toISOString(),
      success: false,
      stage: "extraction",
      extractionError,
    };
    return {
      file: filePath,
      success: false,
      exitCode: 1,
      stage: "extraction",
      report,
    };
  }

  const content = fs.readFileSync(filePath, "utf8");
  let resolvedInputType: ResolvedInputType;
  let diagrams: DiagramChunk[];
  try {
    const extracted = extractDiagrams(content, parsed.inputType);
    resolvedInputType = extracted.resolvedInputType;
    diagrams = extracted.diagrams;
  } catch (err) {
    const extractionError: LintProblem = {
      line: 0,
      code: "extraction-failed",
      message: err instanceof Error ? err.message : String(err),
    };
    const report: ReportPayload = {
      file: filePath,
      profile: parsed.profile,
      inputTypeRequested: parsed.inputType,
      inputTypeResolved: "markdown",
      pinnedMermaidCli: PINNED_MERMAID_CLI,
      sha256: sha256Of(content),
      generatedAt: new Date().toISOString(),
      success: false,
      stage: "extraction",
      extractionError,
    };
    return {
      file: filePath,
      success: false,
      exitCode: 1,
      stage: "extraction",
      report,
    };
  }

  const base: BaseReport = {
    file: filePath,
    profile: parsed.profile,
    inputTypeRequested: parsed.inputType,
    inputTypeResolved: resolvedInputType,
    pinnedMermaidCli: PINNED_MERMAID_CLI,
    sha256: sha256Of(content),
    generatedAt: new Date().toISOString(),
  };

  // Step 1 — Lint every diagram.
  const allLint: LintProblem[] = [];
  const diagramReports: DiagramReport[] = diagrams.map((d) => {
    const problems =
      parsed.profile === "flowchart-strict"
        ? lintFlowchartStrict(d.content, d.startLine - 1)
        : [];
    return {
      diagramIndex: d.diagramIndex,
      sourceKind: d.sourceKind,
      startLine: d.startLine,
      sha256: sha256Of(d.content),
      lintProblems: problems,
    };
  });
  for (const dr of diagramReports) {
    allLint.push(...dr.lintProblems);
  }
  if (allLint.length > 0) {
    const report: ReportPayload = {
      ...base,
      success: false,
      stage: "lint",
      diagrams: diagramReports,
      lintProblems: allLint,
    };
    return {
      file: filePath,
      success: false,
      exitCode: 1,
      stage: "lint",
      report,
    };
  }

  // Step 2 — Run pinned mmdc on each diagram.
  for (const dr of diagramReports) {
    const source = diagrams.find((d) => d.diagramIndex === dr.diagramIndex);
    if (!source) continue;
    const parse = runPinnedMermaidParseFromContent(source.content);
    dr.parse = parse;
    if (!parse.ok) {
      const report: ReportPayload = {
        ...base,
        success: false,
        stage: "parse",
        diagrams: diagramReports,
      };
      return {
        file: filePath,
        success: false,
        exitCode: parse.signal ? 3 : 2,
        stage: "parse",
        report,
      };
    }
  }

  const report: ReportPayload = {
    ...base,
    success: true,
    stage: "complete",
    diagrams: diagramReports,
  };
  return {
    file: filePath,
    success: true,
    exitCode: 0,
    stage: "complete",
    report,
  };
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const parsed = parseArgs(process.argv);
  const outcomes: FileOutcome[] = parsed.files.map((file) =>
    validateFile(file, parsed)
  );

  for (const outcome of outcomes) {
    if (parsed.reportPath) {
      writeReport(outcome.report, parsed.reportPath);
    }
    const banner = outcome.success
      ? `✅ ${outcome.file}`
      : `❌ ${outcome.file} (${outcome.report.stage})`;
    console.log(banner);
    if (!outcome.success && outcome.report.stage === "lint") {
      console.log(formatProblems(outcome.report.lintProblems));
    } else if (!outcome.success && outcome.report.stage === "parse") {
      const failingDiagrams = outcome.report.diagrams.filter(
        (d) => d.parse && !d.parse.ok
      );
      for (const d of failingDiagrams) {
        console.log(`- diagram ${d.diagramIndex} line ${d.startLine}: mmdc failed`);
        if (d.parse?.logs) {
          console.log(d.parse.logs.split("\n").slice(0, 5).join("\n"));
        }
      }
    } else if (!outcome.success && outcome.report.stage === "extraction") {
      console.log(
        `- line ${outcome.report.extractionError.line}: ${outcome.report.extractionError.code}: ${outcome.report.extractionError.message}`
      );
    }
  }

  if (parsed.emitMarker) {
    const now = new Date().toISOString();
    for (const outcome of outcomes) {
      if (outcome.success) {
        try {
          emitMarkersForFile(outcome.file, outcome, now);
          console.log(`📝 Markers inserted: ${outcome.file}`);
        } catch (err) {
          console.error(
            `Failed to insert markers in ${outcome.file}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  // Aggregate exit code = the worst outcome's exit code.
  const worstExit = outcomes.reduce((acc, o) => Math.max(acc, o.exitCode), 0);
  if (worstExit > 0) {
    process.exit(worstExit);
  }

  // Suppress unused warning when no marker emission happens but env is checked.
  void DEFAULT_STALENESS_MS;
}

main();
