# Contract requests from the admin (against contract 0.2.1)

The admin consumes `@bilig/permissions` and `@bilig/content-model` (incl.
`/api`) as-is and never edits them. Everything below is what the admin needed
but the shared contract (and therefore bilig_back) does not provide yet. Each
item says what the admin does today. All are additive unless marked.

## Lists (TZ §5 «Общее для всех списков»)

1. **Server-side sorting.** No admin list query has `sort` / `order`.
   *Request:* `sort` (enum of sortable fields per list) + `order: asc|desc` on
   `AdminListQuerySchema`, `AdminUserListQuerySchema`, `AuditQuerySchema`,
   `BuildListQuerySchema`, `LicenseListQuerySchema`, `StringsQuerySchema` and the
   `PageQuerySchema`-only lists. *Today:* the sort is kept in the URL and applied
   to the loaded page; the UI says so. `supportsServerSort()` switches to the
   server automatically once a query schema has `sort`.
2. **More filters.** `AdminListQuerySchema` lacks `unitKey` (A-13 «массовая
   публикация раздела»), `authorId` / `mine=true` (A-01 «мои черновики»), and a
   typed `status`; `adminItemList` has no `type` / `objectiveKey`; `adminConceptList`
   no `kind`; `BuildListQuerySchema` no `status` (A-01 «ошибки сборки»);
   `AuditQuerySchema` no `from` / `to` / `targetId`, and `actorId` must be a full
   UUID. *Today:* unit and failed-build filters are applied client-side to the
   loaded page.
3. **Topic rows without a title.** `AdminTopicSchema` has only `key`. *Request:*
   `title: LocalizedSchema` (latest version) and `updatedBy` on the row.

## Optimistic locking (TZ §5, §9 If-Match)

4. **Schools and licences have no version.** `SchoolPatchSchema` /
   `LicensePatchSchema` and their endpoints have no `version` / `ifMatch`.
   *Today:* last write wins; the UI warns.
5. **Strings PATCH has no precondition.** *Request:* an optional per-item
   `sourceHash` / `version` precondition with 409 on mismatch.
6. **Partial PATCH cannot clear an optional field.** The backend merges
   `{...stored, ...body}`, and JSON cannot carry `undefined`, so removing e.g.
   `Concept.subtitle` or `Process.energy` is impossible. *Request:* accept
   `null` as "remove" for optional fields in `withVersion(...)` patch schemas, or
   a full-replace PUT (like `AdminItemPatchSchema`).

## Translations (A-11)

7. **One locale per request.** `GET /admin/strings` lists a single `locale`.
   *Today:* the ru / ky / en columns are fetched from the same cursor (keys are
   paged in key order) and joined client-side. *Request:* `locales=ru,ky,en`
   returning `{ key, values: { ky, ru, en }, status: {…}, sourceChanged }`,
   plus `q` (key / text search) and `prefix` (entity, e.g. `topic/animal-cell/`).
8. **No machine-translation trigger** for the `machine` status. Informational.

## Review comments (A-14) — gap

9. **No endpoints.** `ReviewCommentSchema` exists, but nothing stores or lists
   comments. *Request:* `GET /admin/review-comments?targetType=&targetId=`,
   `POST /admin/review-comments`, `PATCH /admin/review-comments/:id` (resolve),
   and `authorId` + `createdAt` on the schema. *Today:* comments are kept per
   reviewer in localStorage and sent inside the reject reason (max 2000 chars).

## Topics and assets (A-05, A-06)

10. **No rights and sources on a topic** («Права и источники»). *Request:*
    `TopicSchema.rights: { license, author, source, notes? }[]` (or per asset).
11. **`AssetReportSchema` lacks the metadata** collected at upload: `filename`,
    `kind`, `license`, `author`, `source`, `createdAt`; there are no asset
    versions («версии ассета») and no delete.
12. **No multipart-complete step.** Presigned part uploads to S3 need
    `POST /admin/assets/:id/complete { parts: [{ partNumber, etag }] }`. *Today:*
    the admin PUTs the parts (resumable, progress kept per file) and calls
    `/process`; with local-disk storage (`partUrls: []`) it works.
13. **Concept usage is partial.** `ConceptUsageSchema` returns only `topicKeys`,
    but delete also refuses for processes and related concepts (the 409 detail
    lists them). *Request:* `usedBy: string[]` (`topic:…`, `process:…`, `concept:…`).
14. **No GET by key for groups and glossary terms.** *Today:* found via
    `?q=` on the list.
15. **Scheduled publish cannot be cancelled** except by a new version.

## Accounts (TZ §6, A-16, A-18)

16. **Admin 2FA enrolment.** An author / editor / superadmin without TOTP gets
    403 `totp_enrollment_required` on the admin audience, and `/me/2fa` needs a
    session. *Today:* the login screen signs in once with `X-Bilig-Audience: client`
    (no TOTP needed there), runs `setup` / `verify`, logs that session out, and
    goes back to the code step. *Request:* a first-class enrolment flow for the
    admin audience (for example a short-lived enrolment token in the 403).
17. **No invite revoke / resend.**
18. **No "access with grounds" to non-pseudonymised pupil data** (A-16 «кроме
    запросов с основанием»): request a reasoned, audited reveal endpoint.
19. **No regression run for the tutor** (A-18 «набор тестовых вопросов для
    регрессии»): settings store the questions; request
    `POST /admin/tutor-settings/regression` → per-question answer + cited concepts.
