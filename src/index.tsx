import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import Layout from './Layout';
import TrackTab from './modules/track/TrackTab';
import HistoryTab from './modules/history/HistoryTab';
import RunDetail from './modules/history/RunDetail';
import ProfileTab from './modules/profile/ProfileTab';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/track" replace />} />
            <Route path="/track" element={<TrackTab />} />
            <Route path="/history" element={<HistoryTab />} />
            <Route path="/history/:id" element={<RunDetail />} />
            <Route path="/profile" element={<ProfileTab />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
