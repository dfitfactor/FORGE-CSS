/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'localhost:3001'],
    },
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/login',
        permanent: false,
      },
      {
        source: '/create-account',
        destination: '/signup',
        permanent: false,
      },
      {
        source: '/auth/signup',
        destination: '/signup',
        permanent: false,
      },
    ]
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
