import React from 'react';
import Logo from './Logo';
import { cn } from './ui';
import {
  LayoutDashboard,
  ScanFace,
  UserPlus,
  ClipboardList,
  BarChart3,
  Settings,
  Search,
  Users,
  Wifi,
  WifiOff,
  ChevronRight,
  Activity,
  Clock,
} from 'lucide-react';

// ── Nav structure with Lucide icons ───────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { id: 'scanner',   icon: ScanFace,        label: 'Live Scanner' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'register', icon: UserPlus,      label: 'Register' },
      { id: 'logs',     icon: ClipboardList, label: 'Logs' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'analytics', icon: BarChart3, label: 'Analytics' },
      { id: 'settings',  icon: Settings,  label: 'Settings' },
    ],
  },
];

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ item, isActive, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2.5 w-full px-3 py-1.5 mx-1 text-sm rounded-md transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-secondary text-foreground font-medium shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
      style={{ width: 'calc(100% - 8px)' }}
    >
      <Icon
        size={15}
        className={cn(
          'flex-shrink-0 transition-opacity',
          isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-80'
        )}
      />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full bg-foreground/60 flex-shrink-0" />
      )}
    </button>
  );
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ online }) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full flex-shrink-0',
        online
          ? 'bg-green-500 shadow-[0_0_0_2px_rgba(34,197,94,0.25)] animate-pulse'
          : 'bg-red-500'
      )}
    />
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar({ tab, setTab, health, onSearch }) {
  const isOnline  = health?.ok === true;
  const userCount = health?.users ?? '—';

  return (
    <aside className="sidebar flex flex-col h-full">

      {/* ── Logo ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 h-14 px-4 border-b border-border flex-shrink-0">
        <Logo />
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 w-full h-8 px-2.5 rounded-md text-xs text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
        >
          <Search size={12} className="flex-shrink-0" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[9px] bg-background border border-border rounded px-1 py-0.5 font-mono opacity-60">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── System status strip ─────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isOnline ? (
              <Wifi size={11} className="text-green-500" />
            ) : (
              <WifiOff size={11} className="text-red-500" />
            )}
            <span className={cn(
              'text-[10px] font-semibold',
              isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-500'
            )}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users size={10} />
            <span>{userCount} registered</span>
          </div>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mb-1">
            <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
              {section.label}
            </p>
            {section.items.map(item => (
              <NavItem
                key={item.id}
                item={item}
                isActive={tab === item.id}
                onClick={() => setTab(item.id)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── HF Space info ────────────────────────────────────────────────────── */}
      {isOnline && health?.hf && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-muted/60 border border-border flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={10} className="text-blue-500 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              HF Space
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {health.hf.replace('https://', '')}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <StatusDot online />
            <span className="text-[9px] text-green-600 dark:text-green-400">
              buffalo_l active
            </span>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="border-t border-border p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-1">
          <StatusDot online={isOnline} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">
              {isOnline ? 'System Online' : 'System Offline'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {isOnline ? `Face recognition ready` : 'Check Railway & HF Space'}
            </p>
          </div>
          <button
            onClick={() => setTab('settings')}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
