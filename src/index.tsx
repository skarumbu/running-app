import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import Layout from './Layout';
import RunTab from './modules/run/RunTab';
import RunsTab from './modules/runs/RunsTab';
import RunDetail from './modules/runs/RunDetail';
import GearTab from './modules/gear/GearTab';
import './index.css';

// Old /history/:id links (e.g. bookmarks) still open the run.
function LegacyRunRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/runs/${id}`} replace />;
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/run" replace />} />
            <Route path="/run" element={<RunTab />} />
            <Route path="/runs" element={<RunsTab />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/gear" element={<GearTab />} />
            <Route path="/track" element={<Navigate to="/run" replace />} />
            <Route path="/history" element={<Navigate to="/runs" replace />} />
            <Route path="/history/:id" element={<LegacyRunRedirect />} />
            <Route path="/profile" element={<Navigate to="/gear" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
