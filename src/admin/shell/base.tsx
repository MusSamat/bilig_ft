/** The admin is mounted under a base path (default `/admin`) by the host app. */
import { createContext, useContext } from 'react';

export const AdminBaseContext = createContext('/admin');

export function useAdminPath(): (p?: string) => string {
  const base = useContext(AdminBaseContext).replace(/\/+$/, '');
  return (p = '') => (p ? `${base}/${p.replace(/^\/+/, '')}` : base || '/');
}
