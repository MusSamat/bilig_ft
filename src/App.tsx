/** Routes (TZ W-05 URL shape: `/:lang/:subject[/:grade]/:topic`). Pages are lazy chunks (§10). */
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { detectLang } from './i18n';
import { Shell } from './components/Shell';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

const TopicPage = lazy(() => import('./topic/TopicPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./register/RegisterPage'));
const CabinetPage = lazy(() => import('./pages/CabinetPage'));
const TeacherPage = lazy(() => import('./pages/TeacherPage'));
const KtpPlanPage = lazy(() => import('./ktp/KtpPlanPage'));
const TextbookPage = lazy(() => import('./pages/TextbookPage'));
const AdminApp = lazy(() => import('./admin'));

function PageFallback(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="page" aria-busy="true" aria-label={t('common.loading')}>
      <span className="panel glass skel" style={{ height: 120 }} />
      <span className="panel glass skel" style={{ height: 360 }} />
    </div>
  );
}

const lazyPage = (C: React.ComponentType) => (
  <Suspense fallback={<PageFallback />}>
    <C />
  </Suspense>
);

export function App(): JSX.Element {
  // Admin (TZ §5) has its own layout and token audience. Mount it outside the client
  // route table: React Router ranks deep "/:lang/:subject/:topic" above "/admin/*".
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <Routes>
        <Route path="/admin/*" element={lazyPage(AdminApp)} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${detectLang()}`} replace />} />
      <Route path="/:lang" element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={lazyPage(LoginPage)} />
        <Route path="register" element={lazyPage(RegisterPage)} />
        <Route path="cabinet" element={lazyPage(CabinetPage)} />
        <Route path="teacher" element={lazyPage(TeacherPage)} />
        <Route path="teacher/ktp/:id" element={lazyPage(KtpPlanPage)} />
        {/* the hand-made slide builder is gone: presentations are ready-made per topic */}
        <Route path="presentation" element={<Navigate to=".." replace />} />
        <Route path="textbooks/:key" element={lazyPage(TextbookPage)} />
        <Route path=":subject/:grade/:topic" element={lazyPage(TopicPage)} />
        <Route path=":subject/:topic" element={lazyPage(TopicPage)} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
