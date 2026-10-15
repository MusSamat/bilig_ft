# bilig_ft

Client for **Bilig**, a data-driven 3D STEM learning platform for schools of
Kyrgyzstan (ky / ru / en, offline-first PWA). Vite + React + react-three-fiber
+ i18next. The API is the separate repo [`bilig_back`](../bilig_back).

## Layout

```
src/                 app shell, catalog, 3D viewer, concept card, i18n, PWA
packages/
  permissions/       RBAC matrix (client only hides buttons)  — @bilig/permissions
  content-model/     content schema + zod validators          — @bilig/content-model
  scene-core/        viewer plugin contract + pure logic      — @bilig/scene-core
docs/TZ.md           technical specification
```

`packages/permissions` and `packages/content-model` are the **shared contract**
with `bilig_back`. Make every change to them in both repos (see TZ §7).

## Run / test

```bash
npm install
npm run dev               # http://localhost:5173, proxies /api -> :3000 (bilig_back)
npm test
npm run typecheck
npm run build             # production bundle + service worker
```
