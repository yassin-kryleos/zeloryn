const getEnv = () => {
  try {
    return (import.meta as any).env.VITE_API_URL;
  } catch (e) {
    return undefined;
  }
};
export const API_BASE_URL = getEnv() || 'http://localhost:3001/api';
