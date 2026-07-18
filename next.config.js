/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['react-simple-maps'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
