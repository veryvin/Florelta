import { useEffect, useRef } from 'react';
import { Link } from '../hooks/useRouter';
import { Avatar } from './ui';

const ICONS = {
  dashboard: (
    <svg className="w-[18px] h-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  'farms-devices': (
    <svg className="w-[18px] h-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z" />
      <path d="M18 12v.5" />
      <path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33" />
    </svg>
  ),
  irrigation: (
    <svg className="w-[18px] h-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22v-9" />
      <path d="M12 13C12 8.5 8.5 5 3 5c0 5.5 3.5 9 9 9" />
      <path d="M12 13c0-4.5 3.5-8 9-8 0 5.5-3.5 9-9 9" />
      <path d="M7 22h10" />
    </svg>
  ),
  alerts: (
    <svg className="w-[18px] h-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  'reports-logs': (
    <svg className="w-[18px] h-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
  settings: (
    <svg className="w-[18px] h-[18px] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
};

const MONITOR_KEYS = new Set(['dashboard', 'farms-devices', 'irrigation']);

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

function systemChipStatus(sd, worstStatus, activeAlerts = []) {
  if (worstStatus === 'critical') {
    const crit = activeAlerts.filter((a) => a.sev === 'critical').length;
    return { dot: 'bg-[#e55365]', text: `${crit || 1} critical ${crit === 1 ? 'alert' : 'alerts'}` };
  }
  if (worstStatus === 'warning') {
    const warn = activeAlerts.filter((a) => a.sev === 'warning').length;
    return { dot: 'bg-[#e5a229]', text: `${warn || 1} ${warn === 1 ? 'reading needs' : 'readings need'} attention` };
  }
  if (worstStatus === 'offline') {
    return { dot: 'bg-white/50', text: 'Device offline' };
  }
  if (activeAlerts && activeAlerts.length > 0) {
    return { dot: 'bg-[#e5a229]', text: `${activeAlerts.length} active alerts` };
  }
  return { dot: 'bg-[#57c278]', text: 'All systems normal' };
}

export default function Sidebar({
  items,
  activeKey,
  badge,
  sd,
  user,
  worstStatus,
  activeAlerts,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  onNavigate,
  onSignOut,
  onResetDB,
}) {
  const navRef = useRef(null);
  const leaveTimer = useRef(null);
  const monitorItems = items.filter((n) => MONITOR_KEYS.has(n[0]));
  const manageItems = items.filter((n) => !MONITOR_KEYS.has(n[0]));
  const chip = systemChipStatus(sd, worstStatus, activeAlerts);

  // Automatically open sidebar when mouse cursor moves near the left edge of the screen
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (e.clientX <= 18 && !drawerOpen) {
        if (onOpenDrawer) onOpenDrawer();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [drawerOpen, onOpenDrawer]);

  // Automatically close sidebar when clicking or tapping anywhere outside
  useEffect(() => {
    if (!drawerOpen) return;

    const handlePointerDownOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        onCloseDrawer();
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [drawerOpen, onCloseDrawer]);

  const handleMouseEnter = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      onCloseDrawer();
    }, 320);
  };

  const renderGroup = (label, list) =>
    list.length > 0 && (
      <div className="mb-4">
        <div className="px-3 pt-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40 select-none">
          {label}
        </div>
        <div className="flex flex-col gap-0.5">
          {list.map((n) => {
            const active = n[0] === activeKey;
            const count = badge(n[0]);
            return (
              <button
                key={n[0]}
                type="button"
                onClick={() => {
                  onNavigate(`/${n[0]}`);
                  onCloseDrawer();
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 h-10 px-3 rounded-lg text-[14px] text-left w-full border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  active
                    ? 'bg-white/14 text-white font-semibold'
                    : 'bg-transparent text-white/75 font-normal hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <span className={active ? 'text-white' : 'text-white/70'}>
                  {ICONS[n[0]] || <i className="not-italic text-[16px]">{n[1]}</i>}
                </span>
                <span className="truncate">{n[2]}</span>
                {count > 0 && (
                  <em className="not-italic ml-auto bg-[#e04856] text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center">
                    {count}
                  </em>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <>
      {/* Invisible hover trigger zone at the very left edge for mouse hovering */}
      {!drawerOpen && (
        <div
          aria-hidden="true"
          onMouseEnter={() => onOpenDrawer && onOpenDrawer()}
          className="fixed inset-y-0 left-0 w-3 z-30 cursor-pointer hidden sm:block"
        />
      )}

      {/* Dimmed backdrop when drawer is open */}
      {drawerOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation menu"
          className="fixed inset-0 bg-ink/40 z-30 cursor-pointer backdrop-blur-[1px] transition-opacity duration-200"
          onClick={onCloseDrawer}
          onPointerDown={onCloseDrawer}
        />
      )}

      {/* Slide-over navigation panel */}
      <nav
        ref={navRef}
        aria-label="Main"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-forest text-white flex flex-col py-6 px-4 overflow-y-auto no-scrollbar transition-transform duration-300 ease-in-out shadow-2xl ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative flex flex-col pb-5 mb-2 border-b border-white/10">
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close navigation menu"
            className="absolute top-0 right-0 w-8 h-8 rounded-lg grid place-items-center text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            ✕
          </button>
          <Link
            to="/dashboard"
            onClick={() => {
              onNavigate('/dashboard');
              onCloseDrawer();
            }}
            className="group pr-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-xl"
          >
            <h2 className="font-display font-bold text-[20px] leading-tight text-white m-0 group-hover:text-accent transition-colors">
              {greeting()}
            </h2>
            <p className="text-[12.5px] text-white/70 mt-1 mb-0 truncate">
              {user?.name ? user.name : 'Sustainable IoT monitoring'}
            </p>
          </Link>
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-white/70">
            <span className={`w-1.5 h-1.5 rounded-full flex-none ${chip.dot}`} aria-hidden="true" />
            <span className="truncate">{chip.text}</span>
          </div>
        </div>

        <div className="flex-1">
          {renderGroup('MONITOR', monitorItems)}
          {renderGroup('MANAGE', manageItems)}
        </div>

        <div className="mt-4 pt-4 border-t border-white/15 flex flex-col gap-3">
          <Link
            to="/settings?tab=account"
            onClick={onCloseDrawer}
            aria-label="My account"
            className="flex items-center gap-2.5 rounded-lg p-1 -m-1 hover:bg-white/[0.07] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <Avatar u={user} size={34} />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-white truncate" title={user.email}>
                {user.email}
              </div>
              <div className="text-[11.5px] text-white/60 leading-tight">{user.role}</div>
            </div>
          </Link>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onCloseDrawer();
                onSignOut();
              }}
              className="inline-flex items-center gap-2 py-1.5 px-2 -ml-2 rounded-lg text-[13px] font-medium text-white/80 hover:bg-white/[0.07] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <svg className="w-4 h-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Sign out</span>
            </button>
            {user.role === 'Owner' && (
              <button
                type="button"
                onClick={() => {
                  onCloseDrawer();
                  onResetDB();
                }}
                title="Clear application data"
                className="py-1.5 px-2 rounded-lg text-[12px] text-white/60 hover:bg-white/[0.07] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                Reset data
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
