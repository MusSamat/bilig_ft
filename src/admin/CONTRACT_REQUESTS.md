# Contract requests from the admin

The admin consumes `@bilig/permissions` and `@bilig/content-model` (incl.
`/api`) as-is and never edits them. Requests #1–#19, filed against contract
0.2.1, were answered by **contract 0.3.0** (see bilig_back
`docs/CONTRACT_CHANGES-0.3.0.md`), and the admin now uses them instead of its
0.2.1 workarounds:

| # | Request | Used in |
|---|---|---|
| 1 | Server-side sorting | `lists/` (`serverSortField`), every list |
| 2 | More filters | Topics (`unitKey`, `mine`), dictionaries (`status`, `kind`, `type`, `objectiveKey`), builds `status`, audit `from`/`to`/`targetId`, schools, invites, assets |
| 3 | Topic title / `updatedBy` on rows | `modules/topics/TopicsList.tsx` |
| 4 | Versioned schools and licences | `modules/Schools.tsx` (If-Match + conflict dialog) |
| 5 | Strings PATCH precondition | `modules/Translations.tsx` (`version` / `sourceHash`) |
| 6 | `null` clears an optional field | `forms/zod-utils.ts` `withRemovals`, `modules/ResourcePages.tsx` |
| 7 | Several locales per request | `modules/Translations.tsx` (`/admin/strings/rows`) |
| 8 | Machine-translation trigger | **Declined** (no MT provider); the `machine` status is still shown |
| 9 | Review comment endpoints | `modules/Review.tsx` |
| 10 | Topic rights | `modules/topics/TopicEditor.tsx` (Rights tab), publish checklist `rights_missing` |
| 11 | Asset metadata, versions, delete | `modules/Assets.tsx` |
| 12 | Multipart complete | `modules/Assets.tsx` |
| 13 | Concept `usedBy` | `modules/Dictionary.tsx` |
| 14 | GET by key for groups and glossary | `modules/resources.tsx` |
| 15 | Cancel a scheduled publish | `modules/Publishing.tsx` |
| 16 | Admin 2FA enrolment | `auth/Login.tsx` (`enrollmentToken`) |
| 17 | Invite revoke / resend | `modules/Users.tsx` |
| 18 | Reveal a pupil «с основанием» | `modules/Users.tsx` |
| 19 | Tutor regression run | `modules/Ops.tsx` |

## Open

None. New requests go here, each with what the admin does until the contract
provides it.
