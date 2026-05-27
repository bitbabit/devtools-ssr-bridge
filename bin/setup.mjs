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
 * Creates / updates instrumentation, next.config wrap, api/devtools/config/route.
 * Prints middleware + layout snippets (manual). See docs/SETUP.md in the package.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recommended instrumentation (fetch + axios). Do not import app axios modules here. */
const INSTRUMENTATION_RECOMMENDED = `/**
 * Patches fetch + axios at server startup.
 * Do not import app axios modules here (can break the instrumentation bundle).
 */
export async function register() {
  const { register: registerDevtools } = await import('@bitbabit/devtools-ssr-bridge/instrument');
  registerDevtools();

  if (typeof window === 'undefined') {
    const axios = (await import('axios')).default;
    const { attachAxiosSsrDevtools } = await import('@bitbabit/devtools-ssr-bridge/attach-axios');
    attachAxiosSsrDevtools(axios);
    const { patchAxiosCreate } = await import('@bitbabit/devtools-ssr-bridge/instrument');
    patchAxiosCreate(axios);
  }
}
`;

const NEXT_CONFIG_IMPORT = `import { withDevtoolsSsrBridge } from '@bitbabit/devtools-ssr-bridge/next';\n`;

const MIDDLEWARE_SNIPPET = `
// --- Manual: middleware (before i18nRouter / your router) ---
// import { prepareDevtoolsSsrRequest, setSsrIdOnMiddlewareResponse } from '@bitbabit/devtools-ssr-bridge/next';
// const devtoolsSsrId = prepareDevtoolsSsrRequest(request, { pathname });
// const response = i18nRouter(request, i18nConfig); // or NextResponse.next()
// setSsrIdOnMiddlewareResponse(response, devtoolsSsrId);
// return response;
`;

const LAYOUT_SNIPPET = `
// --- Manual: root layout (first line) ---
// import { bindDevtoolsSsrCorrelation } from '@bitbabit/devtools-ssr-bridge/ssr-correlation';
// await bindDevtoolsSsrCorrelation();
`;

const AXIOS_SNIPPET = `
// --- Manual: your axios module (server only) ---
// import { attachAxiosSsrDevtools } from '@bitbabit/devtools-ssr-bridge/attach-axios';
// if (typeof window === 'undefined') attachAxiosSsrDevtools(axios, customerAxios);
`;

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

function findNextConfigFile() {
  return ['next.config.mjs', 'next.config.js', 'next.config.ts'].find(fileExists) || null;
}

function setupNextConfig() {
  const configPath = findNextConfigFile();
  if (!configPath) {
    warn('No next.config.{mjs,js,ts} — add withDevtoolsSsrBridge manually (see docs/SETUP.md).');
    return;
  }

  let content = readFile(configPath);
  if (content.includes('withDevtoolsSsrBridge')) {
    success(`next.config already uses withDevtoolsSsrBridge (${configPath})`);
    return;
  }

  if (!content.includes('withDevtoolsSsrBridge')) {
    const shebang = content.startsWith('#!') ? content.split('\n')[0] + '\n' : '';
    const body = shebang ? content.slice(shebang.length) : content;
    content = shebang + NEXT_CONFIG_IMPORT + body;
  }

  if (/export\s+default\s+nextConfig\s*;/.test(content)) {
    content = content.replace(
      /export\s+default\s+nextConfig\s*;/,
      'export default withDevtoolsSsrBridge(nextConfig);',
    );
  } else if (/export\s+default\s+(\w+)\s*;/.test(content)) {
    const name = content.match(/export\s+default\s+(\w+)\s*;/)[1];
    content = content.replace(
      new RegExp(`export\\s+default\\s+${name}\\s*;`),
      `export default withDevtoolsSsrBridge(${name});`,
    );
  } else {
    warn(`${configPath}: could not auto-wrap export — see docs/SETUP.md`);
    return;
  }

  try {
    writeFile(configPath, content);
    success(`Updated ${configPath} with withDevtoolsSsrBridge`);
  } catch {
    warn(`Could not update ${configPath}`);
  }
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

      const content = INSTRUMENTATION_RECOMMENDED;
      writeFile(filePath, content + '\n');
      success(`Created ${filePath} (fetch + axios register)`);
    } catch {
      error('Could not create instrumentation file — fix permissions and re-run.');
      process.exitCode = 1;
    }
  }

  log('');
  setupNextConfig();

  if (appRouter) {
    log('');
    setupConfigApiRoute(ts);
  }

  console.log('');
  log('Setup complete!\n');
  console.log('  Automated: instrumentation, next.config (if possible), api/devtools/config\n');
  console.log('  Full guide: node_modules/@bitbabit/devtools-ssr-bridge/docs/SETUP.md\n');
  console.log('  Manual steps (copy into your app):');
  console.log(MIDDLEWARE_SNIPPET);
  console.log(LAYOUT_SNIPPET);
  console.log(AXIOS_SNIPPET);
  console.log('');
  console.log('  Then: enable Chrome extension, save API key, restart next dev.\n');
  console.log('  Verify: one X-SSR-ID on HTML; same x-ssr-id on all SSR axios calls in Magento logs.\n');
}

run();
