// Runs once when the server boots. Railway keeps one long-lived Node process,
// so this is where the Telegram poll timer gets started — the scheduler itself
// checks whether alerts are switched on before doing anything, so this is safe
// to run even when Telegram is unconfigured.
export async function register() {
  // Guard on the runtime: the edge runtime has no timers worth starting and
  // would pull the whole Node-only store layer into a bundle that can't use it.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { startScheduler } = await import('./lib/telegram/runner');
    startScheduler();
  } catch (e) {
    // A broken scheduler must never stop the site from booting.
    console.error('could not start the Telegram scheduler:', e);
  }
}
