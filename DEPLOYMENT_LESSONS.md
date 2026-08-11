# Deployment Lessons — recruitingnow-workflow

Running log of bugs, build failures, and deployment gotchas found during development,
CI/CD, and live testing. Read this before adding features or changing deploy config.

---

## 2026-08-11 — Wrangler rejects `404` in `_redirects`

**Symptom:** Cloudflare build fails at the very end of `npx wrangler deploy` with:

```
Invalid _redirects configuration:
Line 1: Valid status codes are 200, 301, 302 (default), 303, 307, or 308. Got 404.
[code: 100324]
```

**Cause:** `_redirects` contained `/*.md / 404` (copied from classic Cloudflare Pages
docs in `CONTEXT.md`). This project deploys via **Wrangler Workers static assets**
(`npx wrangler deploy`), which uses a stricter `_redirects` dialect — **404 is not
a valid redirect status**.

**Fix:**
- Removed `_redirects` entirely (no internal `.md` files are deployed anyway).
- Added committed `wrangler.jsonc` so CI does not auto-scaffold config each build.
- Added `.assetsignore` to exclude `.git/`, `.wrangler/`, and `node_modules/` from
  the asset bundle.

**Prevention checklist:**
- [ ] Never use `404` (or any status outside 200/301/302/303/307/308) in `_redirects`
      when deploying with Wrangler.
- [ ] If blocking `.md` files is needed later, either keep them out of the repo or
      handle blocking in Worker script logic — not via `_redirects` 404.
- [ ] Test deploy command locally when changing `_redirects`, `_headers`, or
      `wrangler.jsonc`: `npx wrangler deploy --dry-run` (or a staging project).
- [ ] Commit `wrangler.jsonc` + `.assetsignore` — do not rely on Wrangler's
      non-interactive auto-setup in CI.

---

## 2026-08-11 — Stale Wrangler asset cache keeps deleted `_redirects`

**Symptom:** Build still fails with the same `_redirects` / `404` error **after**
`_redirects` was deleted from git and pushed. Logs show most files skipped:
`Uploaded 3 files (42 already uploaded)`.

**Cause:** Wrangler uses **content-hash asset caching** at Cloudflare's edge. Deleting
a file from git does **not** remove it from the cached asset bundle — the old
`_redirects` (with `/*.md / 404`) was still included via "already uploaded" cache
entries from the previous failed deploys.

**Fix:**
- Moved all deployable static files into a dedicated **`public/`** directory.
- Pointed `wrangler.jsonc` assets at `"./public"` so the asset manifest is a fresh
  namespace (new paths, new hashes — no inherited `_redirects`).
- Removed `_headers` from deploy bundle (no `.md` files live in `public/` anyway).
- Kept internal docs (`DEPLOYMENT_LESSONS.md`, `README.md`) at repo root only —
  they are **not** uploaded as static assets.

**Prevention checklist:**
- [ ] Always deploy static files from an isolated directory (`public/`), never repo
      root (`.`).
- [ ] After deleting a Wrangler config file (`_redirects`, `_headers`), do **not**
      expect deletion alone to fix deploy — verify build logs for "(N already
      uploaded)" and check the cached bundle is not retaining the old file.
- [ ] If a cached bad asset persists, change the assets directory path or force a
      full re-upload (`wrangler deploy --skip-caching` when running locally).
- [ ] Scan build logs: if `.git/` paths appear in upload lists, the assets directory
      is wrong or missing ignore rules.

---

## 2026-08-11 — `.git/` directory included in static asset upload

**Symptom:** Build logs listed files like `/.git/objects/...` and `/.git/HEAD` in the
asset upload queue.

**Cause:** Wrangler assets `directory: "."` with no ignore rules uploads everything in
the repo root, including `.git/` when present in the build environment.

**Fix:** Added `.assetsignore` with `.git`, `.git/**`, `.wrangler`, `node_modules`.

**Prevention checklist:**
- [ ] Always maintain `.assetsignore` when the assets directory is repo root (`.`).
- [ ] After config changes, scan build logs for unexpected paths before the deploy
      API call succeeds.

---

## Template — add new entries below

```markdown
## YYYY-MM-DD — Short title

**Symptom:** What failed or looked wrong.

**Cause:** Root cause.

**Fix:** What changed.

**Prevention checklist:**
- [ ] Action item to avoid recurrence.
```
