import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import DesktopLayout from '../layouts/DesktopLayout';
import HomePage from '../features/home/pages/HomePage';
import FoldersPage from '../features/folders/pages/FoldersPage';
import SearchPage from '../features/search/pages/SearchPage';

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <section style={{ maxWidth: 1280, margin: '0 auto' }}>
    <h1 style={{ margin: 0, color: '#f8fafc', fontSize: '2rem' }}>{title}</h1>
    <p style={{ color: '#94a3b8' }}>Screen under implementation.</p>
  </section>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <DesktopLayout />,
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
        element: <PlaceholderPage title="Tasks" />,
      },
      {
        path: 'settings',
        element: <PlaceholderPage title="Settings" />,
      },
    ],
  },
]);

const Routes = () => {
  return <RouterProvider router={router} />;
};

export default Routes;