import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // 개발 환경: 프론트(3000) → 백엔드(3001) 프록시로 CORS 우회.
    // 프로덕션: NEXT_PUBLIC_API_BASE_URL을 Render 도메인으로 직접 지정.
    if (process.env.NODE_ENV !== 'development') return [];
    const target = process.env.API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
