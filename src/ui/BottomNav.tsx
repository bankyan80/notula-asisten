import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Beranda', icon: '⌂' },
  { to: '/rapat', label: 'Rapat', icon: '🎙' },
  { to: '/notulen', label: 'Notulen', icon: '▤' },
  { to: '/akun', label: 'Akun', icon: '●' },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-0 left-1/2 z-20 flex h-16 w-full max-w-[480px] -translate-x-1/2 items-stretch justify-around border-t border-line bg-white"
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
              isActive ? 'font-bold text-brand' : 'text-muted'
            }`
          }
        >
          <span className="text-xl" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
