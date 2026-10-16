/** TanStack Query bindings over the typed client + permission helpers. */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { ENDPOINTS, type EndpointName } from '@bilig/content-model/api';
import type { Permission } from '@bilig/permissions';
import { useCallback } from 'react';
import type { CallOpts, Resp } from './client';
import { api, useSession } from './session';

export const qk = <N extends EndpointName>(name: N, opts?: CallOpts<N>) =>
  [name, opts?.params ?? {}, opts?.query ?? {}] as const;

export function useApiQuery<N extends EndpointName>(
  name: N,
  opts: CallOpts<N> = {},
  options: Omit<UseQueryOptions<Resp<N>, Error, Resp<N>, readonly unknown[]>, 'queryKey' | 'queryFn'> = {},
) {
  const can = useCanCall(name);
  return useQuery({
    queryKey: qk(name, opts),
    queryFn: ({ signal }) => api.call(name, { ...opts, signal }),
    ...options,
    enabled: can && (options.enabled ?? true),
  });
}

export function useApiMutation<N extends EndpointName>(name: N, invalidate: EndpointName[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: CallOpts<N>) => api.call(name, opts),
    onSuccess: () => {
      for (const n of invalidate) void qc.invalidateQueries({ queryKey: [n] });
    },
  });
}

/** Permission check against `/me.permissions` (presentation only — the backend decides). */
export function usePermissions(): (p: Permission) => boolean {
  const perms = useSession((s) => s.me?.permissions);
  return useCallback((p: Permission) => !!perms?.includes(p), [perms]);
}

export function canCallWith(perms: readonly string[] | undefined, name: EndpointName): boolean {
  const auth = ENDPOINTS[name].auth as string | null;
  if (auth === null) return true;
  if (auth === 'session') return !!perms;
  return !!perms?.includes(auth);
}

/** May the signed-in user call this endpoint? (route table `auth` field vs /me permissions) */
export function useCanCall(name: EndpointName): boolean {
  const perms = useSession((s) => s.me?.permissions);
  return canCallWith(perms, name);
}
