/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `pg` (Supabase mode) and `node:sqlite` (local mode) are server-only
  // Node built-ins/native-ish modules that Next's bundler shouldn't try to
  // bundle for route handlers — this keeps them as real runtime requires.
  // Required for lib/db/* to work correctly in both modes.
  //
  // NOTE: this app pins Next ^14.2.0 (see package.json). Even on the latest
  // 14.x patch (confirmed on 14.2.35) this option still lives under
  // `experimental` — it's only a stable top-level `serverExternalPackages`
  // key starting in Next 15. If you upgrade to Next 15+, move this to a
  // top-level `serverExternalPackages: ["pg"]` and drop the wrapper.
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
