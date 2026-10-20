/** Plain-language grouping of the manager checkboxes and the staff roles (v0.8.0). */
import { MANAGER_ASSIGNABLE, type Permission, type RoleGrant } from '@bilig/permissions';

export type PermGroup = 'teachers' | 'content' | 'journal' | 'deletion' | 'other';

const GROUP_OF: Partial<Record<Permission, PermGroup>> = {
  'teacher.view': 'teachers',
  'teacher.edit': 'teachers',
  'content.draft.edit': 'content',
  'model.upload': 'content',
  'content.review': 'content',
  'content.publish': 'content',
  'platform.manage': 'content',
  'audit.read': 'journal',
  'audit.view': 'journal',
  'deletion.request': 'deletion',
};

const ORDER: PermGroup[] = ['teachers', 'content', 'journal', 'deletion', 'other'];

/** MANAGER_ASSIGNABLE (the contract's checkbox list) split into the four groups SuperAdmin sees. */
export function permissionGroups(): { group: PermGroup; perms: Permission[] }[] {
  return ORDER.map((group) => ({ group, perms: MANAGER_ASSIGNABLE.filter((p) => (GROUP_OF[p] ?? 'other') === group) })).filter((g) => g.perms.length > 0);
}

/** Dotted permission → i18n-safe key (`teacher.view` → `teacher_view`). */
export const permKey = (p: string) => p.replace(/\./g, '_');

export type StaffKind = 'superadmin' | 'manager' | 'staff' | 'teacher' | 'none';

/** What the account is, from its grants (UI routing only — the server decides). */
export function staffKind(grants: readonly RoleGrant[] | undefined): StaffKind {
  const roles = new Set((grants ?? []).map((g) => g.role));
  if (roles.has('superadmin')) return 'superadmin';
  if (roles.has('manager')) return 'manager';
  if (roles.has('author') || roles.has('editor') || roles.has('school_admin')) return 'staff';
  if (roles.has('teacher')) return 'teacher';
  return 'none';
}
