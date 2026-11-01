import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from './AuthContext';
import { RunIcon, ListIcon, ClosetIcon } from './components/Icons';
import { useOutboxAutoSync } from './lib/useOutbox';
import './layout.css';

export default function Layout() {
  const { user, loading, needsSignIn, googleBtnRef, signInNative, nativeSignInError } = useAuth();
  const isNative = Capacitor.isNativePlatform();
  useOutboxAutoSync();

  if (loading) {
    return <div className="login-screen"><span className="login-loading">Loading…</span></div>;
  }

  if (!user) {
    return (
      <div className="login-screen">
        <h1 className="login-title">Run</h1>
        <p className="login-subtitle">Remember how every run felt.</p>
        {isNative ? (
          <>
            <button className="google-btn-native" onClick={signInNative}>
              Sign in with Google
            </button>
            {nativeSignInError && <p className="login-error">{nativeSignInError}</p>}
          </>
        ) : (
          <div ref={googleBtnRef} className="google-btn-container" />
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {needsSignIn && (
        // Not a wall: the run in progress and everything queued keep going.
        <div className="sync-banner" role="status">
          <span className="sync-banner-text">Your sign-in expired. Runs are kept on this phone.</span>
          {isNative ? (
            <button type="button" className="pill-btn sync-banner-btn" onClick={signInNative}>Sign in to sync</button>
          ) : (
            <div ref={googleBtnRef} className="sync-banner-gis" aria-label="Sign in to sync" />
          )}
          {nativeSignInError && <span className="sync-banner-error">{nativeSignInError}</span>}
        </div>
      )}
      <main className="content">
        <Outlet />
      </main>

      <nav className="tab-bar">
        <NavLink to="/run" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon"><RunIcon /></span>
          <span className="tab-label">Run</span>
        </NavLink>
        <NavLink to="/runs" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon"><ListIcon /></span>
          <span className="tab-label">Runs</span>
        </NavLink>
        <NavLink to="/gear" className={({ isActive }) => isActive ? 'tab active' : 'tab'}>
          <span className="tab-icon"><ClosetIcon /></span>
          <span className="tab-label">Gear</span>
        </NavLink>
      </nav>
    </div>
  );
}
