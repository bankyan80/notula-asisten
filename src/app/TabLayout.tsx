import { Outlet } from 'react-router-dom';
import { BottomNav } from '../ui';

/** Layout tab utama: hanya di layar Beranda/Rapat/Notulen/Akun. */
export function TabLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
