// Central API & Socket config
// In production, connects directly to the live Railway backend
const LIVE_BACKEND_URL = 'https://swalef-2s1-production-fdc0.up.railway.app';

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${LIVE_BACKEND_URL}/api`;
  }
  return 'http://localhost:3001/api';
};

const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return LIVE_BACKEND_URL;
  }
  return 'http://localhost:3001';
};

const API_URL = getApiUrl();
const SOCKET_URL = getSocketUrl();

export { API_URL, SOCKET_URL };
