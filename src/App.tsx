/** Routes (TZ W-05 URL shape: /:lang/:subject[/:grade]/:topic). */
import { Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { TopicPage } from './pages/TopicPage';
import { useStore } from './store';

export function App(): JSX.Element {
  const lang = useStore((s) => s.lang);
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${lang}`} replace />} />
      <Route path="/:lang" element={<HomePage />} />
      <Route path="/:lang/:subject/:grade/:topic" element={<TopicPage />} />
      <Route path="/:lang/:subject/:topic" element={<TopicPage />} />
      <Route path="*" element={<Navigate to={`/${lang}`} replace />} />
    </Routes>
  );
}
