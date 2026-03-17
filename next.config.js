/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001'],
    },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid filesystem cache issues on Windows (missing *.pack.gz files).
      config.cache = { type: 'memory' }
    }
    return config
  },
  env: {
    APP_NAME: 'FORGË CSS',
    APP_VERSION: '1.0.0',
  },
}

module.exports = nextConfig
