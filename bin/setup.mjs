#!/usr/bin/env node

/**
 * @bitbabit/devtools-ssr-bridge — automatic setup CLI
 *
 * Detects your Next.js project structure and creates the
 * instrumentation file automatically.
 *
 * Usage:
 *   npx devtools-ssr-bridge-setup
 *
 * Creates / updates instrumentation and (App Router) api/devtools/config/route.{js,ts}.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGISTER_IMPORT_ESM = `export { register } from '@bitbabit/devtools-ssr-bridge/instrument';`;
const REGISTER_IMPORT_CJS = `const { register } = require('@bitbabit/devtools-ssr-bridge/instrument');\nmodule.exports = { register };`;

const PATCH_SNIPPET_TS = [
  `import { patchFetch } from '@bitbabit/devtools-ssr-bridge/instrument';`,
  ``,
  `// DevTools SSR Bridge — injects debug headers on fetch() to Magento URLs`,
  `// For axios: call attachAxiosSsrDevtools(axios, yourInstances) from '@bitbabit/devtools-ssr-bridge/attach-axios' (server-only).`,
  `patchFetch();`,
].join('\n');

const PATCH_SNIPPET_CJS = [
  `const { patchFetch } = require('@bitbabit/devtools-ssr-bridge/instrument');`,
  ``,
  `// DevTools SSR Bridge — injects debug headers on fetch() to Magento URLs`,
  `// For axios: call attachAxiosSsrDevtools(axios, yourInstances) from '@bitbabit/devtools-ssr-bridge/attach-axios' (server-only).`,
  `patchFetch();`,
].join('\n');

const PATCH_SNIPPET_ESM = [
  `import { patchFetch } from '@bitbabit/devtools-ssr-bridge/instrument';`,
  ``,
  `// DevTools SSR Bridge — injects debug headers on fetch() to Magento URLs`,
  `// For axios: call attachAxiosSsrDevtools(axios, yourInstances) from '@bitbabit/devtools-ssr-bridge/attach-axios' (server-only).`,
  `patchFetch();`,
].join('\n');

/** App Router route — httpOnly __devtools_config (Chrome extension POST / same origin). */
const CONFIG_ROUTE_REEXPORT = `export { POST, DELETE } from '@bitbabit/devtools-ssr-bridge/next-app-route';
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cwd = process.cwd();

function isWindows() {
  return process.platform === 'win32';
}

/**
 * Helpful hints when mkdir/write fails (common on Windows: antivirus, Controlled folder access).
 */
function explainFsError(err, operation, targetPath) {
  error(`${operation} failed: ${targetPath}`);
  error(err && err.code ? `${err.code}: ${err.message}` : String(err));
  if (isWindows()) {
    console.log('');
    log('Windows — if you see EACCES / EPERM / permission denied:');
    console.log('  • Run the terminal as Administrator, or');
    console.log('  • Windows Security → Virus & threat protection → Exclusions →');
    console.log('    add this project folder (or node.exe under Program Files\\nodejs);');
    console.log('  • If Ransomware protection → Controlled folder access is ON:');
    console.log('    Allow an app → add node.exe and npm.cmd (or turn off for dev folders);');
    console.log('  • Close apps that lock files (OneDrive sync, another editor);');
    console.log('  • Clear read-only on the project folder: Properties → uncheck Read-only.');
    console.log('');
  }
}

function log(msg) {
  console.log(`\x1b[36m[devtools-ssr-bridge]\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32m✔\x1b[0m ${msg}`);
}

function warn(msg) {
  console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
}

function error(msg) {
  console.error(`\x1b[31m✖\x1b[0m ${msg}`);
}

/** Checks if a file exists at the given path. */
function fileExists(filePath) {
  return existsSync(resolve(cwd, filePath));
}

/** Reads a file relative to cwd. */
function readFile(filePath) {
  try {
    return readFileSync(resolve(cwd, filePath), 'utf-8');
  } catch (err) {
    explainFsError(err, 'Read', filePath);
    throw err;
  }
}

/** Writes a file relative to cwd (creates parent dirs). Safe on Windows when using path.join segments. */
function writeFile(filePath, content) {
  const fullPath = resolve(cwd, filePath);
  const dir = dirname(fullPath);
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, content, { encoding: 'utf8' });
  } catch (err) {
    explainFsError(err, 'Write', filePath);
    throw err;
  }
}

/** Detects whether the project uses TypeScript. */
function isTypeScript() {
  return fileExists('tsconfig.json');
}

/** Detects whether Next.js is installed. */
function isNextProject() {
  if (!fileExists('package.json')) return false;
  try {
    const pkg = JSON.parse(readFile('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return 'next' in deps;
  } catch {
    return false;
  }
}

function getPackageType() {
  try {
    const pkg = JSON.parse(readFile('package.json'));
    return pkg.type === 'module' ? 'module' : 'commonjs';
  } catch {
    return 'commonjs';
  }
}

/** Detects App Router (app/ directory) vs Pages Router. */
function hasAppRouter() {
  return fileExists('app') || fileExists('src/app');
}

/** `src/app` or `app` — where App Router routes live. */
function getAppDirectory() {
  if (fileExists('src/app')) return 'src/app';
  if (fileExists('app')) return 'app';
  return null;
}

/** Creates `app/api/devtools/config/route.{js|ts}` if missing (extension / popup cookie API). */
function setupConfigApiRoute(useTypeScript) {
  const appRoot = getAppDirectory();
  if (!appRoot) {
    warn('No app/ directory found — skipping devtools config API route (create src/app or app first).');
    return;
  }

  const ext = useTypeScript ? 'ts' : 'js';
  const relPath = join(appRoot, 'api', 'devtools', 'config', `route.${ext}`);

  if (fileExists(relPath)) {
    const content = readFile(relPath);
    if (
      content.includes('next-app-route') ||
      content.includes('createDevToolsConfigHandler')
    ) {
      success(`DevTools config API route already present: ${relPath}`);
      return;
    }
    warn(
      `${relPath} already exists with different content — not overwriting. Merge manually or delete the file and re-run.`,
    );
    return;
  }

  try {
    writeFile(relPath, CONFIG_ROUTE_REEXPORT);
    success(`Created ${relPath} (POST/DELETE → httpOnly __devtools_config)`);
  } catch {
    warn('Could not create devtools config route file — see errors above. You can add it manually:');
    const hint = join(appRoot, 'api', 'devtools', 'config', `route.${ext}`);
    console.log(`  ${hint}\n`);
  }
}

/** Detects if instrumentation file already exists. */
function findExistingInstrumentation() {
  const candidates = [
    'instrumentation.ts',
    'instrumentation.js',
    'instrumentation.mjs',
    'src/instrumentation.ts',
    'src/instrumentation.js',
    'src/instrumentation.mjs',
  ];
  return candidates.find(fileExists) || null;
}

/** Checks if a file already contains our import. */
function alreadyPatched(filePath) {
  const content = readFile(filePath);
  return content.includes('devtools-ssr-bridge');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
  log('Setting up SSR debug bridge...\n');

  // Step 1: Verify Next.js project
  if (!isNextProject()) {
    error('This does not appear to be a Next.js project (no "next" in package.json).');
    error('Run this command from your Next.js project root.');
    process.exit(1);
  }
  success('Next.js project detected');

  const ts = isTypeScript();
  const pkgType = getPackageType();
  success(`Language: ${ts ? 'TypeScript' : 'JavaScript'}`);

  const appRouter = hasAppRouter();
  success(`Router: ${appRouter ? 'App Router' : 'Pages Router'}`);

  // Step 2: Check for existing instrumentation file
  const existing = findExistingInstrumentation();

  if (existing) {
    if (alreadyPatched(existing)) {
      success(`Instrumentation already references devtools-ssr-bridge in ${existing}`);
    } else {
      try {
        // Append to existing file
        log(`Found existing ${existing} — appending bridge setup...`);
        const content = readFile(existing);
        const isTs = existing.endsWith('.ts');
        const isEsmFile = existing.endsWith('.mjs') || (existing.endsWith('.js') && pkgType === 'module');
        const snippet = isTs ? PATCH_SNIPPET_TS : (isEsmFile ? PATCH_SNIPPET_ESM : PATCH_SNIPPET_CJS);
        writeFile(existing, content.trimEnd() + '\n\n' + snippet + '\n');
        success(`Updated ${existing}`);
      } catch {
        process.exitCode = 1;
      }
    }
  } else {
    try {
      // Create new file
      const ext = ts ? '.ts' : '.js';

      // Detect src/ directory structure (path.join for Windows)
      const useSrc = fileExists('src');
      const filePath = useSrc
        ? join('src', `instrumentation${ext}`)
        : `instrumentation${ext}`;

      const content = ts || pkgType === 'module' ? REGISTER_IMPORT_ESM : REGISTER_IMPORT_CJS;
      writeFile(filePath, content + '\n');
      success(`Created ${filePath}`);
    } catch {
      error('Could not create instrumentation file — fix permissions and re-run.');
      process.exitCode = 1;
    }
  }

  // Step 3: App Router config cookie API (chrome extension / POST __devtools_config)
  if (appRouter) {
    log('');
    setupConfigApiRoute(ts);
  }

  // Step 4: Summary
  console.log('');
  log('Setup complete! Here\'s what happens now:\n');
  console.log('  1. Install the package (if not already):');
  console.log('     npm i @bitbabit/devtools-ssr-bridge\n');
  console.log('  2. Enable the Chrome extension on your site');
  console.log('     (grant host permission for your Next.js domain)\n');
  console.log('  3. App Router: devtools config route at api/devtools/config (if generated),');
  console.log('     wrap next.config if you use withDevtoolsSsrBridge, middleware SSR correlation,');
  console.log('     and attachAxiosSsrDevtools for axios — see package README.\n');
  console.log('  4. Start your dev server — fetch() to Magento gets headers;');
  console.log('     axios needs attach-axios as above.\n');
}

run();
