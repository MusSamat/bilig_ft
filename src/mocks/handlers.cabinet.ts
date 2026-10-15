/** DEV/TEST-ONLY extra MSW handlers for the cabinets work package (merged into `handlers`). */
import { HttpResponse, http, type HttpHandler } from 'msw';
import { API_PREFIX, HEADERS, problem } from '@bilig/content-model/api';
import { mockDb, userById } from './db';

const SESSION_IDS: Record<string, string> = {};
const sessionId = (token: string) =>
  (SESSION_IDS[token] ??= `0192a000-0000-7000-8000-${String(Object.keys(SESSION_IDS).length + 1).padStart(12, '0')}`);

export const cabinetHandlers: HttpHandler[] = [
  // GET /me/sessions — every token issued to the user is one "device".
  http.get(`${API_PREFIX}/me/sessions`, ({ request }) => {
    if (mockDb.flags.offline) return HttpResponse.error();
    const auth = request.headers.get(HEADERS.authorization);
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = userById(mockDb.tokens[token]);
    if (!user) {
      const p = problem('unauthorized');
      return HttpResponse.json(p, { status: p.status });
    }
    const now = Date.now();
    const items = Object.entries(mockDb.tokens)
      .filter(([, id]) => id === user.id)
      .slice(-5)
      .map(([tok]) => ({
        id: sessionId(tok),
        device: tok === token ? 'Chrome · Windows' : 'Firefox · Linux',
        createdAt: new Date(now - 3600_000).toISOString(),
        expiresAt: new Date(now + (user.kind === 'student' ? 8 : 720) * 3600_000).toISOString(),
        current: tok === token,
      }));
    return HttpResponse.json({ items });
  }),
];
