# Contract requests from bilig_ft

Changes the client needs in the shared contract (`packages/content-model`,
`packages/permissions`). bilig_ft does not edit those packages; each item
below has a local workaround in `src/api/extensions.ts` or in the mocks
(`src/mocks/handlers*.ts`) until the backend adds it.

## API (`@bilig/content-model/api`)

Resolved in contract v0.2.1 and used by the client: `GET /me/assignments`
(`meAssignments`), `GET /classes/:id/students` (`classStudents`),
`DELETE /me/sessions/:id` (`meSessionRevoke`).

1. **Topic info in `MyAssignment`** (title, subjectKey, grade): the student
   dashboard looks the topic up in the catalog to show its title and build the
   `/:lang/:subject/:grade/:topic` link.
2. **Server pagination for `GET /assignments/:id/results`** (W-53 «таблицы с
   серверной пагинацией»): add `PageQuerySchema` and `nextCursor`, or split
   `students` into a paginated endpoint. Today the client pages 20 per page
   locally.
3. **`hardestItems[].prompt`** (localized) in `AssignmentResults`, so the
   results view doesn't need to download the topic package to show question
   texts.
4. **`TopicSummary.thumb` as an absolute URL** (CDN, hash-addressed), or a
   `filesBaseUrl` in `TopicSummary`. Right now it is package-relative, and the
   catalog has no base to resolve it, so home/catalog tiles can't show
   thumbnails without fetching each manifest. The mock catalog already returns
   absolute URLs.
5. **`TopicSummary.conceptKeys`** (or `GET /progress?topics=` returning
   summaries), so the student dashboard can count «изучено N из M» per topic
   without loading every package. Today the client caps `visitedConcepts` at
   `counts.concepts`.

## Content model (`@bilig/content-model`)

6. **Topic-level sample properties** (W-30 «свойства образца (формула,
   молярная масса, форма, объём…)»): `Topic.props?: ConceptProp[]` or
   `Sample.props`. The client currently shows the props of the topic's first
   container concept with props (e.g. `chem.water`), and uses the same props
   for the comparison column of the current sample.
7. **Engine parameter conventions** (`Process.params`, A-08): document per
   engine which keys the engines read. The client engines
   (`packages/scene-core/src/engines.ts`) read: `timeline` →
   `<metric>@<stepKey>` cumulative targets (else min→max over step durations);
   `stoich` → `n0.<m>`/`nu.<m>`, or the content form (species coefficients +
   `M_<species>` + `dH_kJ`, reactants/products from the equation sides);
   `ode` → `omega`, `zeta`, `x0`, `v0`, `mass`. The sim plugin computes the
   pendulum, inclined plane, orbit and DC-circuit readouts from their params.
   Most `timeline` processes in the content have domain parameters
   (`emf`, `resistance`, `radius`…) but no per-step targets, so their metrics
   fall back to min→max over time. Per-step targets would make those values
   meaningful.
8. **`LANGS` beyond ky/ru/en**: the UI picks its language list from
    `src/locales/<lang>/`, but `LocalizedSchema` and `isLang` are fixed to three
    languages, so a fourth UI language needs a contract change.

## Teacher self-registration (v0.6.0)

9. **Error shape of `POST /auth/register/verify`** is not in the contract. The
   client (and the mock) assume `401 invalid_credentials` with
   `detail: code_invalid` for a wrong code and `detail: code_expired` once the
   code is burned (5 wrong tries) or expired, `429 rate_limited` +
   `retryAfter` for limits; `POST /auth/register/resend` within 60 s →
   `429 rate_limited` + `retryAfter`. `password_weak` uses the server's
   `detail` (`too_short` / `leaked` / `too_simple`). Please confirm or add
   these `detail` values to the contract.
10. **`region`** is free text in `RegisterRequest`; the client sends a stable
    key (`bishkek`, `osh-city`, `batken`, `jalal-abad`, `issyk-kul`, `naryn`,
    `osh`, `talas`, `chui`) and localizes the names. A `RegionSchema` enum in
    the contract would keep the admin side consistent.
