/**
 * Bilig admin (TZ §5), mounted by the host app under `/admin/*` and loaded
 * lazily (`React.lazy(() => import('./admin'))`) so it never counts against
 * the client's initial-JS budget. Self-contained: its own API client (always
 * `X-Bilig-Audience: admin`), session state, TOTP login, query cache, i18n
 * namespace `admin` and styles scoped under `.admin-root`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, useSession } from './api/session';
import { AuthCorner, Login, loadMe } from './auth/Login';
import { registerAdminEditors } from './forms/domain-editors';
import { registerAdminI18n, useAdminLang, useT } from './i18n';
import { AdminBaseContext } from './shell/base';
import { Brand, Layout, hasAdminAccess } from './shell/Layout';
import { useAdminTheme } from './shell/theme';
import { Toaster } from './shell/toast';
import { AdminIconSprite, Icon } from './lib/icons';
import { Analytics } from './modules/Analytics';
import { AssetReportPage, AssetsList } from './modules/Assets';
import { Dashboard } from './modules/Dashboard';
import {
  ConceptEdit,
  ConceptsList,
  CourseEdit,
  CoursesList,
  GlossaryEdit,
  GlossaryList,
  GroupEdit,
  GroupsList,
  ItemEdit,
  ItemsList,
  ObjectiveEdit,
  ObjectivesList,
  ProcessEdit,
  ProcessesList,
  SubjectEdit,
  SubjectsList,
  UnitEdit,
  UnitsList,
} from './modules/Dictionary';
import { AuditLog, TutorSettingsPage } from './modules/Ops';
import { Programme } from './modules/Programme';
import { PublishingDetail, PublishingList } from './modules/Publishing';
import { ReviewList, ReviewTopic } from './modules/Review';
import { SchoolDetail, SchoolsList } from './modules/Schools';
import { ComparisonEditor } from './modules/topics/ComparisonEditor';
import { TopicEditor, registerTopicActivities } from './modules/topics/TopicEditor';
import { TopicCreate, TopicsList } from './modules/topics/TopicsList';
import { TourEditor } from './modules/topics/TourEditor';
import { Translations } from './modules/Translations';
import { UserDetail, UsersPage } from './modules/Users';
import './styles.css';

export { registerAdminI18n, ADMIN_NS } from './i18n';
export { registerPropertyEditor, registerScenePlugin, registerActivity } from './forms/registry';
export { setPreviewBridge, setPreviewRenderer } from './lib/preview-bridge';

registerAdminEditors();
registerTopicActivities();

export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="subjects" element={<SubjectsList />} />
        <Route path="subjects/:key" element={<SubjectEdit />} />
        <Route path="groups" element={<GroupsList />} />
        <Route path="groups/:key" element={<GroupEdit />} />
        <Route path="programme" element={<Programme />} />
        <Route path="courses" element={<CoursesList />} />
        <Route path="courses/:key" element={<CourseEdit />} />
        <Route path="units" element={<UnitsList />} />
        <Route path="units/:key" element={<UnitEdit />} />
        <Route path="objectives" element={<ObjectivesList />} />
        <Route path="objectives/:key" element={<ObjectiveEdit />} />
        <Route path="concepts" element={<ConceptsList />} />
        <Route path="concepts/:key" element={<ConceptEdit />} />
        <Route path="assets" element={<AssetsList />} />
        <Route path="assets/:id" element={<AssetReportPage />} />
        <Route path="topics" element={<TopicsList />} />
        <Route path="topics/new" element={<TopicCreate />} />
        <Route path="topics/:id" element={<TopicEditor />} />
        <Route path="topics/:id/tour" element={<TourEditor />} />
        <Route path="topics/:id/comparison" element={<ComparisonEditor />} />
        <Route path="processes" element={<ProcessesList />} />
        <Route path="processes/:key" element={<ProcessEdit />} />
        <Route path="items" element={<ItemsList />} />
        <Route path="items/:key" element={<ItemEdit />} />
        <Route path="translations" element={<Translations />} />
        <Route path="glossary" element={<GlossaryList />} />
        <Route path="glossary/:key" element={<GlossaryEdit />} />
        <Route path="publishing" element={<PublishingList />} />
        <Route path="publishing/:id" element={<PublishingDetail />} />
        <Route path="review" element={<ReviewList />} />
        <Route path="review/:id" element={<ReviewTopic />} />
        <Route path="schools" element={<SchoolsList />} />
        <Route path="schools/:id" element={<SchoolDetail />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="tutor" element={<TutorSettingsPage />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Route>
    </Routes>
  );
}

function NoAccess() {
  const t = useT();
  return (
    <div className="adm-login">
      <AuthCorner />
      <div className="adm-login__card">
        <Brand />
        <span className="adm-login__icon">
          <Icon id="lock" size={26} />
        </span>
        <h1>{t('app.noAccessTitle')}</h1>
        <p className="adm-muted">{t('app.noAccess')}</p>
        <button type="button" className="adm-btn" onClick={async () => { await api.call('logout', { body: {} }).catch(() => undefined); useSession.getState().signOut(); }}>
          {t('app.logout')}
        </button>
      </div>
    </div>
  );
}

/** Restore the session from the refresh cookie once, then route to login / no access / the app. */
function Gate({ children }: { children: ReactNode }) {
  const t = useT();
  const status = useSession((s) => s.status);
  const me = useSession((s) => s.me);
  useEffect(() => {
    if (useSession.getState().status !== 'unknown') return;
    let alive = true;
    void (async () => {
      const ok = await api.refresh();
      if (!alive) return;
      if (!ok) return useSession.getState().signOut();
      try {
        await loadMe();
      } catch {
        useSession.getState().signOut();
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (status === 'unknown')
    return (
      <div className="adm-boot" aria-busy="true">
        <Brand />
        <p className="adm-muted">{t('common.loading')}</p>
      </div>
    );
  if (status === 'anonymous' || !me) return <Login />;
  if (!hasAdminAccess(me.permissions)) return <NoAccess />;
  return <>{children}</>;
}

export interface AdminAppProps {
  /** Where the host mounted the admin (default `/admin`). */
  basePath?: string;
  /** i18next instance with the `admin` namespace registered (default: the host's global one). */
  i18n?: I18n;
  /** Own query client (tests); by default the admin keeps a cache separate from the client app. */
  queryClient?: QueryClient;
}

export default function AdminApp({ basePath = '/admin', i18n, queryClient }: AdminAppProps) {
  const [qc] = useState(() => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const lang = useAdminLang((s) => s.lang);
  const { theme, style } = useAdminTheme();
  // Register the `admin` namespace inside the lazy chunk, so the locale files never reach the host's initial bundle.
  const { i18n: hostI18n } = useTranslation();
  registerAdminI18n(i18n ?? hostI18n);
  const tree = (
    <QueryClientProvider client={qc}>
      <AdminBaseContext.Provider value={basePath}>
        <div className="admin-root" lang={lang} data-theme={theme} style={style}>
          <AdminIconSprite />
          <Gate>
            <AdminRoutes />
          </Gate>
          <Toaster />
        </div>
      </AdminBaseContext.Provider>
    </QueryClientProvider>
  );
  return i18n ? <I18nextProvider i18n={i18n}>{tree}</I18nextProvider> : tree;
}
