'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useIdleLogout(timeoutMinutes = 60) {
  const router = useRouter();

  useEffect(() => {
    const ms = timeoutMinutes * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    function reset() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
      }, ms);
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach(ev => window.removeEventListener(ev, reset));
    };
  }, [timeoutMinutes, router]);
}
