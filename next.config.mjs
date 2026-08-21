/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript errors fail the build. The codebase is strict-clean; keeping this
  // enforced is what stops a type error from reaching production again.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
