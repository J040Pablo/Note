import React from 'react';
import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom';
import DesktopLayout from '../layouts/DesktopLayout';
import HomePage from '../features/home/pages/HomePage';
import FoldersPage from '../features/folders/pages/FoldersPage';
import SearchPage from '../features/search/pages/SearchPage';
import TasksPage from '../features/tasks/pages/TasksPage';
import EntryModePage from '../features/entry/pages/EntryModePage';
import { useAppMode } from './mode';

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <section style={{ maxWidth: 1280, margin: '0 auto' }}>
    <h1 style={{ margin: 0, color: '#f8fafc', fontSize: '2rem' }}>{title}</h1>
    <p style={{ color: '#94a3b8' }}>Screen under implementation.</p>
  </section>
);

const EntryRoute: React.FC = () => {
  const { mode, ready } = useAppMode();

  if (!ready) return null;
  if (mode) return <Navigate to="/" replace />;
  return <EntryModePage />;
};

const RequireMode: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mode, ready } = useAppMode();

  if (!ready) return null;
  if (!mode) return <Navigate to="/entry" replace />;
  return <>{children}</>;
};

const router = createBrowserRouter([
  {
    path: '/entry',
    element: <EntryRoute />,
  },
  {
    path: '/',
    element: (
      <RequireMode>
        <DesktopLayout />
      </RequireMode>
    ),
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'search',
        element: <SearchPage />,
      },
      {
        path: 'folders',
        element: <FoldersPage />,
      },
      {
        path: 'tasks',
        element: <TasksPage />,
      },
      {
        path: 'settings',
        element: <PlaceholderPage title="Settings" />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

const Routes = () => {
  return <RouterProvider router={router} />;
};

export default Routes;