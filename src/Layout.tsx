import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './layout.css';

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-title">Run</span>
        {user && (
          <button className="signout-btn" onClick={signOut}>
            {user.displayName || user.email}
          </button>
        )}
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
