import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './AuthContext';
import './layout.css';

const TrackIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <ellipse cx="12" cy="12" rx="9" ry="5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M3 12h18" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 2.5"/>
  </svg>
);

const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M4.5 20c1.5-3.5 4.3-5.5 7.5-5.5s6 2 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

export default function Layout() {
  const { user, loading, googleBtnRef, signInNative } = useAuth();
  const isNative = Capacitor.isNativePlatform();

  if (loading) {
    return <div className="login-screen"><span className="login-loading">Loading…</span></div>;
  }

  if (!user) {
    return (
      <div className="login-screen">
        <h1 className="login-title">Run</h1>
        <p className="login-subtitle">Track your runs, see your progress.</p>
        {isNative ? (
          <button className="google-btn-native" onClick={signInNative}>
            Sign in with Google
          </button>
        ) : (
          <div ref={googleBtnRef} className="google-btn-container" />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="content">
        <Outlet />
      </main>

      <nav className="tab-bar">
        <NavLink to="/track" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon"><TrackIcon /></span>
          <span className="tab-label">Track</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon"><HistoryIcon /></span>
          <span className="tab-label">History</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon"><ProfileIcon /></span>
          <span className="tab-label">Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}
