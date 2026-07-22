/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `pg` (Supabase mode) and `node:sqlite` (local mode) are server-only
  // Node built-ins/native-ish modules that Next's bundler shouldn't try to
  // bundle for route handlers — this keeps them as real runtime requires.
  // Required for lib/db/* to work correctly in both modes.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
