# Publish `@bitbabit/devtools-ssr-bridge` to npm

CI uses **npm Trusted Publishing** (OIDC). A granular token that passes `npm whoami` can still **fail on `npm publish`** without publish + 2FA bypass.

## One-time setup on npmjs.com (required for GitHub Actions)

1. Open [package access settings](https://www.npmjs.com/package/@bitbabit/devtools-ssr-bridge/access).
2. **Publishing access** → **Trusted publishing** → **GitHub Actions** → **Add**.
3. Set:
   - **Repository owner:** `bitbabit`
   - **Repository name:** `devtools-ssr-bridge`
   - **Workflow filename:** `publish.yml`
   - **Environment name:** *(leave empty)*
4. Save.

## Release from GitHub

1. Bump `"version"` in `package.json` (e.g. `0.2.0`).
2. Commit, push `main`.
3. Tag: `git tag v0.2.0 && git push origin v0.2.0`
4. **Releases** → **Draft new release** → choose tag → **Publish release**.

Or: **Actions** → **Publish to npm** → **Run workflow** (uses version in `package.json` on `main`).

## Publish from your machine (immediate workaround)

```bash
cd devtools-ssr-bridge
npm ci
npm run build
npm login
npm publish --access public
```

## If CI still fails

Open the failed run → **Publish to npm** step log (also copied to the job **Summary** tab). Common messages:

| npm error | Fix |
|-----------|-----|
| `403` / `two-factor` | Enable Trusted publishing (above), or use Automation token with **Bypass 2FA** |
| `403` / not authorized | Your npm user must be owner of `@bitbabit/devtools-ssr-bridge` |
| `402` | Billing issue on npm account |
| version already exists | Bump `package.json` version |

**Do not** rely on `NPM_TOKEN` alone unless it has **Read and write** on this package **and** **Bypass 2FA for automation**.
