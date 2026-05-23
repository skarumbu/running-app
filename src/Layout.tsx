import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './layout.css';

export default function Layout() {
  const { user, loading, signOut, googleBtnRef } = useAuth();

  if (loading) {
    return <div className="login-screen"><span className="login-loading">Loading…</span></div>;
  }

  if (!user) {
    return (
      <div className="login-screen">
        <h1 className="login-title">Run</h1>
        <p className="login-subtitle">Track your runs, see your progress.</p>
        <div ref={googleBtnRef} className="google-btn-container" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-title">Run</span>
        <button className="signout-btn" onClick={signOut}>
          {user.displayName || user.email}
        </button>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tab-bar">
        <NavLink to="/track" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon">▶</span>
          <span className="tab-label">Track</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon">📋</span>
          <span className="tab-label">History</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon">👤</span>
          <span className="tab-label">Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}
