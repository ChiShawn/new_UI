// src/services/patientService.ts
import axios from 'axios'; // 確保 axios 已導入

// API 位址應為代理伺服器的相對路徑，這樣可以利用 vite.config.ts 的設定
// 請確保您的 vite.config.ts 已將 /api 代理到後端 FastAPI 的 IP 和端口
const API_BASE_URL = '/api';

// 創建一個預配置的 axios 實例，並導出為 apiClient
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 恢復請求攔截器，在每次請求發送前，檢查 localStorage 中是否有 token，並添加到 Authorization header
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    console.log('patientService.ts: axios 請求攔截器 - 從 localStorage 讀取到 Token:', token ? '存在' : '不存在');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('patientService.ts: axios 請求攔截器 - Authorization header 已設定。');
    } else {
      console.warn('patientService.ts: axios 請求攔截器 - 未找到 Token，請求將不會帶有 Authorization header。');
    }
    return config;
  },
  (error) => {
    console.error('patientService.ts: axios 請求攔截器錯誤:', error);
    return Promise.reject(error);
  }
);

// --- ICDAssessment 介面 (用於 Assessment 欄位) ---
export interface ChtnoICDXAssessment {
  ICDX: string;
  ICDX_NAME: string;
}

// --- ObjectiveDetail 介面 (用於解析 Objective 細項) ---
export interface ObjectiveDetail {
    key: string;
    value: string;
    original_line: string; // 用於在選擇時保留原始行內容
}

// --- PatientData 介面 (重要修改：應反映 chtno.json 的最終格式) ---
export interface PatientData {
  CHTNO: string;
  NAME: string;
  caseno?: string; // 對應 chtno.json 中的 caseno
  SCHDATE?: string; // 對應 chtno.json 中的 SCHDATE
  EXEDEPT?: string; // 對應 chtno.json 中的 EXEDEPT
  EXEDR?: string; // 對應 chtno.json 中的 EXEDR
  Subjective?: string; // 對應 chtno.json 中的 Subjective (首字母大寫)
  Objective?: string;  // 對應 chtno.json 中的 Objective (首字母大寫)
  Assessment?: ChtnoICDXAssessment[]; // 對應 chtno.json 中的 Assessment，內部是 ICDX/ICDX_NAME
  ObjectiveDetails?: ObjectiveDetail[]; // 新增：後端解析出的 Objective 細項列表
  // 如果 chtno.json 會有 Plan 欄位，請在這裡加上
  // Plan?: string; 
  
  // 其他 OPD.json 中的原始欄位 (如 AGE, GENDER, HEIGHT, WEIGHT 等) 不會直接在此介面中出現，
  // 因為後端已將其轉換或包含在 Objective 文本中。
  // 如果您希望在前端單獨顯示這些欄位，則需要讓後端在 chtno.json 格式中也包含它們，
  // 並相應更新此 PatientData 介面。
}


// --- 現有的 getPatientByCaseno 函式 (透過病歷號碼 CHTNO 查詢特定病人) ---
export const getPatientByCaseno = async (chtno_to_find: string): Promise<PatientData> => {
  try {
    console.log(`patientService.ts: 嘗試獲取病患資料，CHTNO: ${chtno_to_find}`);
    // 這個路由應該對應後端的 GET /api/patients/{chtno}
    const response = await apiClient.get(`/patients/${chtno_to_find}`);
    console.log('patientService.ts: 成功獲取病患資料。');
    return response.data; // 後端應該返回 chtno.json 格式的 PatientData
  } catch (error) {
    console.error(`patientService.ts: 獲取病患資料失敗，CHTNO: ${chtno_to_find}:`, error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || `讀取失敗: ${error.response.status}`);
    }
    throw error;
  }
};

// --- 新增：獲取當前登入使用者病患資料的函式 (無需輸入病歷號) ---
// 這個函式將會呼叫後端的 GET /api/patients 路由
export const getPatientForCurrentUser = async (): Promise<PatientData | null> => {
  try {
    console.log('patientService.ts: 嘗試獲取當前使用者病患資料。');
    // 這個路由對應後端的 GET /api/patients，後端會根據當前用戶讀取並轉換資料
    const response = await apiClient.get(`/patients`);
    console.log('patientService.ts: 成功獲取當前使用者病患資料。');
    
    // 後端返回的是 List[ChtnoPatient]，所以 response.data 是一個陣列
    if (Array.isArray(response.data) && response.data.length > 0) {
      return response.data[0]; // 假設只會返回一個病人的資料，取第一項
    }
    return null; // 如果沒有資料，返回 null
  } catch (error) {
    console.error("patientService.ts: 獲取當前使用者病患資料失敗:", error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || `讀取失敗: ${error.response.status}`);
    }
    throw error;
  }
};

// --- 現有的 savePatientData (重要：目前將 chtno.json 格式的 PatientData 直接發送給後端儲存) ---
// 如果您的後端 save_patient_data_for_user 期望接收 OPD.json 格式，則這裡需要進行反向轉換。
// 目前假設後端 PUT /patients/{chtno} 路由也能接收 chtno.json 格式的 PatientData。
export const savePatientData = async (data: PatientData): Promise<void> => {
  try {
    console.log(`patientService.ts: 嘗試儲存病患資料，CHTNO: ${data.CHTNO}`);
    // 儲存時使用 CHTNO 作為路由參數，並發送 chtno.json 格式的數據
    await apiClient.put(`/patients/${data.CHTNO}`, data); 
    console.log('patientService.ts: 成功儲存病患資料。');
  } catch (error) {
    console.error('patientService.ts: 儲存病患資料失敗:', error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || `儲存失敗: ${error.response.status}`);
    }
    throw error;
  }
};
