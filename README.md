# bilig_ft

Client for **Bilig**, a data-driven 3D STEM learning platform for schools of
Kyrgyzstan (ky / ru / en). Vite + React 18 + TypeScript, react-three-fiber +
drei, TanStack Query, Zustand, i18next. The API is the separate repo
[`bilig_back`](../bilig_back). Specification: [`docs/TZ.md`](docs/TZ.md).

No screen knows a subject or topic by name: the catalog, topic page, scene,
modes, card, processes, comparison and quiz are all built from content
packages and scene plugins.

## Layout

```
src/
  api/            typed client over the contract ENDPOINTS (zod-validated), session, SSE tutor
  components/     shell: header, catalog modal, breadcrumbs, icon sprite, toasts
  topic/          topic page: header, tiles, samples, stage + toolbar, mode panel,
                  structure tree, concept card + examples, assistant, processes,
                  comparison, quiz, lesson mode
  scene/          lazy 3D viewer core (camera flights, labels, lighting, adaptive DPR, capture)
  presentation/   deck template, editor, PPTX (pptxgenjs) and PDF (jsPDF) export — lazy
  pages/ cabinet/ home, login, student and teacher dashboards
  state/          zustand stores (ui, viewer, deck)
  lib/            IndexedDB (Dexie), progress, formulas, hooks, URLs, theme
  locales/<lang>/ UI strings per namespace (new language = new folder)
  mocks/          DEV/TEST ONLY: MSW handlers + a snapshot of bilig_back content
packages/
  permissions/    RBAC matrix                       — shared contract (edited in bilig_back)
  content-model/  content schemas + API DTOs        — shared contract (edited in bilig_back)
  scene-core/     viewer contract + pure logic: modes, selection, URL state, progress,
                  player, stepper, engines (timeline/stoich/ode), label layout, hue tokens
  scene-kit/      r3f helpers shared by plugins (looks, picking)
  plugin-gltf/    GLB scenes with node masks (meshopt + KTX2); procedural fallback
  plugin-molecule/ ball-and-stick / space-filling, animated electron shells
  plugin-crystal/ lattices (rock salt, sc, bcc, fcc, CsCl)
  plugin-geometry/ solids, solid / wireframe
  plugin-sim/     simulations (pendulum, inclined plane, circuit, orbits…) with formula readouts
e2e/              Playwright: TZ §3 student and teacher scenarios, axe, 360 px
CONTRACT_REQUESTS.md  contract changes the client needs from bilig_back
```

`packages/permissions` and `packages/content-model` are the **shared
contract** with `bilig_back`; only the backend edits them (TZ §7). Client
needs go to `CONTRACT_REQUESTS.md`.

## Run

```bash
npm install
npm run dev               # http://localhost:5173, proxies /api -> :3000 (bilig_back)
npm run dev:mock          # same, with the MSW mock API (VITE_MOCK=1) — no backend needed
```

Mock accounts (dev only): teacher `teacher@bilig.kg` / `bilig-teacher-2026`;
students: class code `ABC123`, any name, PIN `1234`.
Teacher sign-up (`/:lang/register`, contract 0.6.0): the mock e-mail code is always
`012345` (like the server's `AUTH_FIXED_OTP`); the UI never shows it. In the browser console,
`__biligMock.setTutorDown(true)` simulates a 503 from the assistant.

## Test

```bash
npm run typecheck         # app + every workspace package
npm test                  # Vitest: packages (pure logic) + components (Testing Library, MSW, jsdom)
npm run build             # production build
npm run size              # initial JS ≤ 250 KB gzip, and no mocks in the build
npx playwright install chromium
npm run e2e               # Playwright against the dev server with mocks (+ axe)
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests, build, size check and e2e.

## Architecture notes

- **URL is the state** (W-05): `/:lang/:subject/:grade/:topic?focus=&mode=&process=&step=&view=lesson&lesson=`.
  The header switches language by navigating to the same URL under the new `/:lang`.
- **Plugins** register from a lazy chunk (`src/scene/plugins.ts`), so three.js
  is not in the initial bundle. The panel is `plugin.modes() ∩ scene.modes` +
  universal modes; labels come from `mode.<id>` locale keys.
- **Readouts** come from the plugin's `readouts()` or the process engine in
  scene-core — never hand-written numbers.
- **Permissions** come from `GET /me`; the client only hides buttons.
- **Assistant in the classroom** (contract 0.4.0). The users are teachers who
  explain a topic to the class on a screen:
  - Each question carries a context envelope (`src/topic/tutorContext.ts`:
    mode, process step, sample, focus concept). The chat shows that context as
    chips the teacher can remove, and offers follow-ups from the contract's
    `suggestQuestions`.
  - Selecting learning text (`[data-ask]` regions) opens the selection toolbar
    (`SelectionMenu.tsx`): Explain / Simpler / Example ask the assistant with
    the selection as a quote, Translate looks the words up in the topic
    glossary offline, and «Ask…» attaches the quote to a typed question.
  - «Ещё примеры» under each example block and «Вопросы для класса»
    (`PracticeQuiz.tsx`: one question at a time, reveal the answer, nothing
    saved) fetch AI-made material from `/tutor/generate`. Everything generated
    carries an «ИИ» badge and the teacher's verdict buttons.
  - The assistant stays available in lesson mode.
- **i18n**: `src/i18n.test.ts` checks equal key sets, plural categories per
  `Intl.PluralRules`, that used keys exist, and that src has no literal UI strings.
- **Out of scope for now**: offline downloads and the results sync queue
  (W-55), the offline assistant fallback, new PWA work. The existing
  vite-plugin-pwa config is unchanged.
