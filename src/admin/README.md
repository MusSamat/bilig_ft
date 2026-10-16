# Bilig admin (`src/admin`)

The content/publishing/schools/users admin from TZ §5 (A-01 … A-19), built
into the **bilig_ft** client and served from the same build under `/admin/*`.
It is loaded lazily, so neither its JS nor its CSS counts against the client's
initial-JS budget (TZ §10: ≤ 250 KB gzip). The backend is **bilig_back**
(`/api/v1`); both repos share the vendored contract in `packages/`
(`@bilig/permissions`, `@bilig/content-model`, `@bilig/content-model/api`).

## Mounting (host side)

```tsx
// src/App.tsx
const AdminApp = lazy(() => import('./admin'));
// inside <Routes>, next to "/:lang" (the static segment wins in React Router 6 ranking)
<Route path="/admin/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} />
```

Nothing is needed in `src/i18n.ts`: on load, `AdminApp` registers its own
`admin` namespace (ru, ky) on the host's i18next instance, so the locale files
also stay out of the initial bundle. (`registerAdminI18n(i18n)` is exported for
hosts that want to register it themselves — importing it eagerly would pull the
locales into the initial chunk.)

## Run

```bash
# bilig_back on :3000 (e.g. in-memory demo data)
STORAGE=memory DEMO_SEED=true npm start          # in bilig_back; prints the superadmin TOTP secret
# bilig_ft
npm run dev                                       # → http://localhost:5173/admin (Vite proxies /api → :3000)
npm test                                          # admin tests live in src/admin/**/*.test.ts(x)
npm run typecheck && npm run build
```

Demo superadmin: `super@demo.bilig.kg` / `bilig-demo-2026` + the TOTP code
from the secret bilig_back prints. Admin tokens use the `admin` audience; the
refresh token is the HttpOnly cookie `bilig_admin_rt` (same origin via the
proxy). In production the admin can live on its own domain (`admin.bilig.kg`):
add that origin to bilig_back's `CORS_ORIGIN` / `ADMIN_URL`.

## How it is built

| Piece | Where | What |
|---|---|---|
| API client | `api/client.ts` | Typed over `ENDPOINTS`; parses every body/query **before** sending and every JSON response **after** receiving with the contract schemas (`ContractError` otherwise); always `X-Bilig-Audience: admin`; `If-Match: "<version>"` for `ifMatch` endpoints; one refresh-and-retry on 401; problem+json → `ApiError(code)`. |
| Session | `api/session.ts` | Zustand: access token **in memory only**, `/me` (permissions). |
| Login | `auth/Login.tsx` | Password → 401 `totp_required` → TOTP step; 403 `totp_enrollment_required` → enrolment via `/me/2fa` (see CONTRACT_REQUESTS #16). |
| Permissions | `api/hooks.ts` | `useCanCall(endpoint)` compares the route table's `auth` with `/me.permissions`; nav items, buttons and bulk actions are hidden accordingly (the backend still decides). |
| Forms | `forms/` | `SchemaForm` renders any contract schema through the **editor registry** and validates with the same schema. Resolution: exact schema → union variant → field key → structural built-ins. Extension points: `registerPropertyEditor(type, C)`, `registerScenePlugin({ id, params, modes, editor })`, `registerActivity({ id, path, schema | route })`, `registry.forSchema/forKey/forVariant`. |
| Lists | `lists/` | Cursor pagination with a cursor trail (back/forward), filters/sort/limit in the URL, row selection + bulk actions. Server sort switches on automatically when a list query gains `sort` (CONTRACT_REQUESTS #1). |
| Locking & drafts | `lib/versioned.tsx`, `lib/draft.ts` | Every editor saves with the version it was based on; 409 opens a dialog with a field diff and «взять их» / «сохранить мою поверх». Unsaved edits autosave to localStorage and are offered back. |
| Preview | `modules/topics/Preview.tsx`, `lib/preview-bridge.ts` | The topic draft is assembled into a ContentPackage, validated with `validatePackage`, and shown as a structured card (ky/ru/en). **3D extension point:** `setPreviewRenderer(Component)` and `setPreviewBridge({ getCamera, getVisibility, getFocus, getNodes, playProcess })` — the «сохранить текущий вид», node binding and «проиграть» buttons enable themselves. |
| Hue math | `lib/hue.ts` | Local hue → tokens + WCAG contrast (same method as `@bilig/scene-core`, which the admin does not import). |
| Styles | `styles.css` | Everything scoped under `.admin-root`; light/dark via `prefers-color-scheme`. |
| i18n | `i18n.ts`, `locales/{ru,ky}.json` | Namespace `admin`; the admin language is its own setting (ru / ky), independent of the client UI language. A test checks that every generated form field, enum value and problem code has ru and ky labels. |

## Status by TZ ID

| ID | Module | Status |
|---|---|---|
| A-01 | Dashboard | Drafts, waiting for review, untranslated counts per language, failed builds, latest publications. «Мои» = within your scope (no author filter, #2). |
| A-02 | Subjects | CRUD + groups; ky/ru/en names; icon picker; hue with light/dark preview and AA table. |
| A-03 | Programme | Courses, units, objectives (CRUD); objectives CSV import (validated per row, create or update); coverage (objectives no topic version references). |
| A-04 | Concepts | CRUD with typed props (property-type dictionary decides the kind), related, misconceptions, container flag; usage panel; delete disabled while used and 409 `in_use` shown. |
| A-05 | Assets | Upload metadata (licence/author/source required), resumable part upload to presigned URLs, processing (backend stub), report: sizes, saving, triangles, node tree, violations. Versions/licence display: #11. |
| A-06 | Topic editor | Tabs Basic / Scene / Structures / Activities / Texts / Rights; new draft version with If-Match + basedOn; demo flag and unit move; live structured preview + validation; 3D extension point. Rights: #10. |
| A-07 | Tour | Steps with drag-and-drop and keyboard reorder, camera/visibility/focus capture from the preview bridge, PUT with If-Match. |
| A-08 | Processes | CRUD (engine, equation, in/out/energy, steps with structure and result, metrics with units) + step player; «в 3D-превью» via the bridge. |
| A-09 | Comparisons | Columns from topic concepts/samples, rows from property types; values from the dictionary (with overrides), manual input only where the property is missing. |
| A-10 | Item bank | All 5 types via the discriminated union, explanation, objective, misconception, difficulty; answer stats. |
| A-11 | Translations | ru → ky → en side by side; URL filters (target, status, untranslated, source changed, search); machine-draft badge; inline edits + bulk «проверено» in one PATCH; CSV/XLIFF import and export; glossary highlight + forbidden-variant warning. One-locale API: #7. |
| A-12 | Glossary | CRUD (ky/ru/en, forbidden variants, approved by). |
| A-13 | Publishing | Statuses and allowed actions (server `availableActions` ∩ permissions), checklist, diff between any versions, rollback, scheduled publish, builds + rebuild, bulk submit/publish/archive (unit filter on the page). |
| A-14 | Review comments | Field-path / 3D-anchor comments (`ReviewCommentSchema`) kept locally and sent in the reject reason. **Backend has no comment endpoints (#9).** |
| A-15 | Schools & licences | Schools, licences (subjects, grades, seats, period), invite a school admin. No locking in the API (#4). |
| A-16 | Users | Search + role/status/school filters, grants editor, invites, block/unblock (bulk), password reset, 2FA reset, revoke sessions; pupils pseudonymised by the server. |
| A-17 | Analytics | Period in URL; KPIs, daily charts (with table view), by school/region, popular topics/structures, hardest items, tutor usage, unanswered questions, tokens. |
| A-18 | Tutor settings | Generated form; PUT with If-Match and the conflict dialog. Regression run: #19. |
| A-19 | Audit log | Read-only; actor/action/target type filters in the URL; diff expand. |

Numbers (#n) refer to [CONTRACT_REQUESTS.md](./CONTRACT_REQUESTS.md).
