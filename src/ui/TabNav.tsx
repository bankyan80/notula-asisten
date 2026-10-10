import { NavLink } from 'react-router-dom';

export interface TabItem {
  to: string;
  label: string;
  end?: boolean;
}

export interface TabNavProps {
  items: TabItem[];
  ariaLabel?: string;
}

export function TabNav({ items, ariaLabel = 'Tab halaman' }: TabNavProps) {
  return (
    <div
      role="navigation"
      aria-label={ariaLabel}
      className="flex overflow-x-auto border-b border-line bg-white"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          className={({ isActive }) =>
            `shrink-0 border-b-2 px-4 py-3 text-sm font-semibold ${
              isActive ? 'border-brand text-brand' : 'border-transparent text-muted'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
