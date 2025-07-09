import { apiClient } from './patientService';

// 定義從後端收到的 ICD 物件格式
export interface ICDAssessment {
  code: string;
  name: string;
}

/**
 * 根據主訴文字，請求後端推論 ICD 碼
 * @param subjectiveText - 主訴內容
 * @returns 一個包含 ICD 碼和名稱的物件陣列
 */
export const inferIcdCodes = async (subjectiveText: string): Promise<ICDAssessment[]> => {
  try {
    // 呼叫我們在後端新增的 /api/icd/infer 端點
    const response = await apiClient.post<ICDAssessment[]>('/icd/infer', { subjective_text: subjectiveText });
    return response.data;
  } catch (error) {
    console.error('ICD 推論失敗:', error);
    // 將後端回傳的錯誤訊息拋出，或提供一個預設訊息
    const message = (error as any).response?.data?.detail || 'Not Found';
    throw new Error(message);
  }
};

