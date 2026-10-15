/**
 * Tutor (W-32, §9 POST /tutor/ask): SSE stream parsed with the contract's
 * `parseSseEvents`; JSON mode when the server answers with JSON. A 503
 * (`tutor_unavailable`) or a network error is surfaced as ApiError so the UI
 * shows a localized «assistant unavailable» message.
 */
import { TutorAskResponseSchema, parseSseEvents, type TutorAskRequest, type TutorStreamEvent } from '@bilig/content-model/api';
import { ApiError, rawCall } from './client';

export async function askTutor(req: TutorAskRequest, onEvent: (ev: TutorStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await rawCall('tutorAsk', { body: req, headers: { Accept: 'text/event-stream' }, signal });
  const type = res.headers.get('Content-Type') ?? '';
  if (!type.includes('text/event-stream') || !res.body) {
    const parsed = TutorAskResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new ApiError(res.status, 'invalid_response', 'errors.invalid_response');
    onEvent({ type: 'token', text: parsed.data.answer });
    parsed.data.citations.forEach((conceptKey) => onEvent({ type: 'citation', conceptKey }));
    onEvent({ type: 'done', threadId: parsed.data.threadId });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseEvents(done ? buffer + '\n\n' : buffer);
    buffer = rest;
    events.forEach(onEvent);
    if (done) break;
  }
}
