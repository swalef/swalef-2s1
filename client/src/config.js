// Unified API & Socket config for Swalef
// Automatically adapts to local development (Vite port 5173) and unified production deployment

const isViteDev = () => {
  if (typeof window === 'undefined') return false;
  return window.location.port === '5173';
};

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (isViteDev()) return 'http://localhost:3001/api';
  return '/api';
};

const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (isViteDev()) return 'http://localhost:3001';
  return typeof window !== 'undefined' ? window.location.origin : '';
};

const API_URL = getApiUrl();
const SOCKET_URL = getSocketUrl();

export { API_URL, SOCKET_URL };
