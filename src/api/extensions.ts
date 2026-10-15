/**
 * Calls added in contract v0.2.1 (requested in CONTRACT_REQUESTS.md):
 * GET /me/assignments and GET /classes/:id/students. A server that does not
 * have them yet answers 404 → treated as an empty list.
 */
import type { MyAssignment } from '@bilig/content-model/api';
import { api, isApiError } from './client';

export type { MyAssignment };

const orEmpty = async <T>(p: Promise<T>, empty: T): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    if (isApiError(e) && (e.status === 404 || e.status === 501)) return empty;
    throw e;
  }
};

export const fetchMyAssignments = () => orEmpty(api('meAssignments'), { items: [] as MyAssignment[] });

export const fetchClassStudents = (classId: string, cursor?: string, limit = 20) =>
  orEmpty(api('classStudents', { params: { id: classId }, query: { limit, cursor } }), { items: [], nextCursor: null });
