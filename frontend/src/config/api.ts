//const API_BASE_URL = 'http://localhost:8000';

export const API_ENDPOINTS = {
  // 認證相關
  LOGIN: `${API_BASE_URL}/auth/login`,
  LOGOUT: `${API_BASE_URL}/auth/logout`,
  
  // 用戶管理
  USERS: `${API_BASE_URL}/auth/users`,
  USER: (username: string) => `${API_BASE_URL}/auth/users/${username}`,
  
  // 病人資料
  PATIENT: `${API_BASE_URL}/api/patient`,
};

export default API_ENDPOINTS; 
