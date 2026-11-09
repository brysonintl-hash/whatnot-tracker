/** @type {import('next').NextConfig} */
const nextConfig = {
  // Runs instrumentation.ts once on server boot, which is where the Telegram
  // alert poller is started. Required on Next 14; it is on by default from 15.
  experimental: { instrumentationHook: true },
  transpilePackages: ['react-simple-maps'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // instrumentation.ts is compiled for the edge runtime too, because
  // middleware.ts exists, and webpack follows its dynamic import into the
  // Node-only store layer even though the runtime guard means it can never
  // run there. Stubbing these on the edge build only keeps that resolvable;
  // the Node build is untouched and still gets the real modules.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === 'edge') {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    }
    return config;
  },
};

module.exports = nextConfig;
