import { spawn } from "child_process";
import { ANALYZER_DIR } from "./paths";

export interface AnalyzedClass {
  name: string;
  filePath: string;
  baseTypes: string[];
  referencedTypes: string[];
  methodCount: number;
  // v5: empty string for classes in the global namespace (no `namespace` at all).
  namespaceName: string;
}

export interface AnalyzerResult {
  classes: AnalyzedClass[];
}

export interface SyntaxValidationResult {
  valid: boolean;
  errors: string[];
}

// Runs the Roslyn analyzer (Syntax-only — no MSBuildWorkspace/compilation) against a
// local folder and returns its class/inheritance/dependency JSON.
export function runAnalyzer(targetPath: string): Promise<AnalyzerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("dotnet", ["run", "--project", ANALYZER_DIR, "--", targetPath]);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        return reject(new Error(`analyzer exited with code ${exitCode}: ${stderr.trim()}`));
      }
      // dotnet may print restore/build chatter before our JSON on a cold run,
      // so only the last non-empty line is treated as the actual payload.
      const lastLine = stdout.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(lastLine) as AnalyzerResult);
      } catch {
        reject(new Error(`analyzer produced non-JSON output: ${stdout.trim()}`));
      }
    });
  });
}

// Separate mode, separate from class/dependency extraction above — feeds a
// single file's source over stdin and gets back only whether it parses.
// Syntax-only (CSharpSyntaxTree.ParseText + GetDiagnostics), same as the
// folder analysis: no compilation, no type checking.
export function validateSyntax(sourceCode: string): Promise<SyntaxValidationResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("dotnet", ["run", "--project", ANALYZER_DIR, "--", "--validate-syntax"]);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        return reject(new Error(`analyzer (--validate-syntax) exited with code ${exitCode}: ${stderr.trim()}`));
      }
      const lastLine = stdout.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(lastLine) as SyntaxValidationResult);
      } catch {
        reject(new Error(`analyzer produced non-JSON output: ${stdout.trim()}`));
      }
    });

    child.stdin.write(sourceCode);
    child.stdin.end();
  });
}

export interface ContentFile {
  path: string;
  content: string;
}

// v8: same class/dependency extraction as runAnalyzer's folder scan, but for
// a handful of in-memory files (a Step's file-changes) instead of a real
// checkout on disk — lets Step 8 read structure (method counts etc.) off of
// what Step 7 just generated without writing anything to disk or re-fetching
// from GitHub.
export function analyzeFileContents(files: ContentFile[]): Promise<AnalyzerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("dotnet", ["run", "--project", ANALYZER_DIR, "--", "--analyze-content"]);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        return reject(new Error(`analyzer (--analyze-content) exited with code ${exitCode}: ${stderr.trim()}`));
      }
      const lastLine = stdout.trim().split("\n").pop() ?? "";
      try {
        resolve(JSON.parse(lastLine) as AnalyzerResult);
      } catch {
        reject(new Error(`analyzer produced non-JSON output: ${stdout.trim()}`));
      }
    });

    child.stdin.write(JSON.stringify(files));
    child.stdin.end();
  });
}
