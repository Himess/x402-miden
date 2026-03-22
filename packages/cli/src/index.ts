#!/usr/bin/env node

/**
 * create-miden-agent
 *
 * CLI scaffolding tool for creating new x402 Miden projects.
 * Uses only Node.js built-ins -- no external dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

interface Template {
  name: string;
  description: string;
  dirName: string;
}

const TEMPLATES: Template[] = [
  {
    name: "basic-agent",
    description: "Simple agent that auto-pays 402 responses",
    dirName: "basic-agent",
  },
  {
    name: "paywall-server",
    description: "Express server with Miden payment middleware",
    dirName: "paywall-server",
  },
  {
    name: "full-stack",
    description: "Agent + server with end-to-end payment flow",
    dirName: "full-stack",
  },
];

// ---------------------------------------------------------------------------
// Terminal I/O helpers (no external dependencies)
// ---------------------------------------------------------------------------

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function log(message: string): void {
  process.stdout.write(message + "\n");
}

function logError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

// ---------------------------------------------------------------------------
// File copying
// ---------------------------------------------------------------------------

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function resolveTemplatesDir(): string {
  // In the built package, templates are at dist/../src/templates
  // (because we include src/templates in the package files)
  const fromDist = path.resolve(__dirname, "..", "src", "templates");
  if (fs.existsSync(fromDist)) {
    return fromDist;
  }

  // In development, templates are next to the source
  const fromSrc = path.resolve(__dirname, "templates");
  if (fs.existsSync(fromSrc)) {
    return fromSrc;
  }

  throw new Error(
    "Could not find templates directory. This is a bug in create-miden-agent.",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  log("");
  log("  create-miden-agent");
  log("  Scaffold a new x402 Miden project");
  log("");

  // Project name from args or prompt
  let projectName = args[0];
  let templateName = args[1];

  const rl = createInterface();

  try {
    if (!projectName) {
      projectName = await ask(rl, "  Project name: ");
      if (!projectName) {
        logError("Project name is required.");
        process.exit(1);
      }
    }

    // Template selection
    if (!templateName) {
      log("");
      log("  Available templates:");
      log("");
      for (let i = 0; i < TEMPLATES.length; i++) {
        log(`    ${i + 1}. ${TEMPLATES[i].name} -- ${TEMPLATES[i].description}`);
      }
      log("");

      const choice = await ask(rl, "  Choose a template (1-3): ");
      const index = parseInt(choice, 10) - 1;

      if (isNaN(index) || index < 0 || index >= TEMPLATES.length) {
        logError("Invalid template choice.");
        process.exit(1);
      }

      templateName = TEMPLATES[index].name;
    }
  } finally {
    rl.close();
  }

  const template = TEMPLATES.find((t) => t.name === templateName);
  if (!template) {
    logError(`Unknown template: ${templateName}`);
    logError(`Available templates: ${TEMPLATES.map((t) => t.name).join(", ")}`);
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);
  if (fs.existsSync(targetDir)) {
    logError(`Directory already exists: ${targetDir}`);
    process.exit(1);
  }

  // Copy template
  const templatesDir = resolveTemplatesDir();
  const templateDir = path.join(templatesDir, template.dirName);

  if (!fs.existsSync(templateDir)) {
    logError(`Template directory not found: ${templateDir}`);
    process.exit(1);
  }

  log(`  Creating project in ${targetDir}...`);
  log("");

  copyDirRecursive(templateDir, targetDir);

  // Update package.json with the project name
  const pkgJsonPath = path.join(targetDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    pkgJson.name = projectName;
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
  }

  log(`  Done! Created ${projectName} from template "${template.name}".`);
  log("");
  log("  Next steps:");
  log("");
  log(`    cd ${projectName}`);
  log("    npm install");
  log("    npm run dev");
  log("");
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
