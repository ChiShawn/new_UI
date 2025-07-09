import { apiClient } from './patientService';
import axios from 'axios'; // 確保 axios 被導入，用於錯誤類型判斷

interface CustomTemplateResponse {
  content: string;
}

/**
 * 獲取自定義範本內容。
 * @param type - 範本類型 ('subjective' 或 'objective')
 * @returns 範本內容
 */
export const getCustomTemplate = async (type: 'subjective' | 'objective'): Promise<string> => {
  try {
    // GET 請求的 type 參數是查詢參數，這部分通常是正常的
    const response = await apiClient.get<CustomTemplateResponse>(`/user/custom-template?type=${type}`);
    return response.data.content;
  } catch (error) {
    console.error(`讀取 ${type} 範本失敗:`, error);
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(error.response.data.detail || `讀取失敗: ${error.response.status}`);
    }
    throw error;
  }
};

/**
 * 儲存自定義範本內容。
 * @param type - 範本類型 ('subjective' 或 'objective')
 * @param content - 要儲存的內容
 * @returns 無
 */
export const saveCustomTemplate = async (type: 'subjective' | 'objective', content: string): Promise<void> => {
  try {
    // 關鍵修正：確保 POST 請求的 URL 中包含 `?type=${type}`
    // 後端錯誤訊息明確指出 'type' 查詢參數缺失
    const response = await apiClient.post(`/user/custom-template?type=${type}`, { content }); 
    console.log(`儲存 ${type} 範本成功:`, response.data);
    return; // 不需要返回具體數據，只確認成功
  } catch (error) {
    console.error(`儲存 ${type} 範本失敗:`, error);
    if (axios.isAxiosError(error) && error.response) {
      // 顯示後端返回的詳細錯誤信息，這應包含 FastAPI 的 422 錯誤細節
      throw new Error(error.response.data.detail || `儲存失敗: ${error.response.status}`);
    }
    throw error;
  }
};

