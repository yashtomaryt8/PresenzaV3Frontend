import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DynamicIslandNav from './components/DynamicIslandNav';
import GlobalSearch from './components/GlobalSearch';
import Dashboard from './components/Dashboard';
import Scanner from './components/Scanner';
import Register from './components/Register';
import Logs from './components/Logs';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import { api } from './utils/api';

export default function App() {
  const [tab,         setTab]         = useState('dashboard');
  const [health,      setHealth]      = useState(null);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const ping = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth({ ok: true, users: h.users, hf: h.hf_space });
    } catch {
      setHealth({ ok: false });
    }
  }, []);

  useEffect(() => {
    ping();
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [ping]);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Close sidebar on Escape key
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleTabChange = (t) => {
    setTab(t);
    setSidebarOpen(false);
  };

  const pages = {
    dashboard: <Dashboard setTab={setTab} />,
    scanner:   <Scanner />,
    register:  <Register />,
    logs:      <Logs />,
    analytics: <Analytics />,
    settings:  <Settings health={health} />,
  };

  return (
    <div className="app-shell">

      {/* ── Desktop sidebar — outer div owns the sidebar CSS class ── */}
      {/* The Sidebar component's inner <aside> must NOT have .sidebar class */}
      <div className="sidebar hidden lg:flex">
        <Sidebar tab={tab} setTab={handleTabChange} health={health} onSearch={() => setSearchOpen(true)} />
      </div>

      {/* ── Mobile sidebar overlay + drawer ── */}
      {sidebarOpen && (
        <>
          {/* Dim overlay — clicking it closes the sidebar */}
          <div
            className="sidebar-mobile-overlay lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar drawer — outer div owns .sidebar.open, inner Sidebar has no .sidebar class */}
          <div className="sidebar open lg:hidden">
            <Sidebar
              tab={tab}
              setTab={handleTabChange}
              health={health}
              onSearch={() => { setSidebarOpen(false); setSearchOpen(true); }}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <div className="main-area">
        <Header
          tab={tab}
          health={health}
          onSearch={() => setSearchOpen(true)}
          onMenuOpen={() => setSidebarOpen(true)}
        />
        <div className="page-scroll">
          <div className="page-content">
            {pages[tab] || pages.dashboard}
          </div>
        </div>
      </div>

      {/* ── Mobile bottom nav ── */}
      <DynamicIslandNav tab={tab} setTab={handleTabChange} />

      {/* ── Global search ── */}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
