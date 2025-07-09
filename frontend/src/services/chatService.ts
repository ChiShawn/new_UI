import axios from 'axios';

const API_BASE_PATH = '/api'; 

axios.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log("chatService.ts: axios 請求攔截器 - Authorization header 已設定。\n");
        } else {
            console.log("chatService.ts: axios 請求攔截器 - 未找到 Token，Authorization header 未設定。\n");
        }
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

export const transcribeAudio = async (audioFile: File): Promise<string> => {
    try {
        console.log(`接收到音訊檔案，大小: ${audioFile.size} bytes. 正在準備進行地端語音辨識...\n`);
        const formData = new FormData();
        formData.append('file', audioFile, audioFile.name);

        // --- 修正點：將請求路徑更改為 /api/voice/voicetotext ---
        const response = await axios.post(`${API_BASE_PATH}/voice/voicetotext`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            timeout: 60000 
        });
        return response.data.text; 
    } catch (error: any) {
        let errorMessage = '語音辨識失敗';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error(`語音辨識服務 HTTP 錯誤: ${error.response.status} - ${JSON.stringify(error.response.data)}\n`);
                errorMessage = `語音辨識失敗: 服務錯誤 ${error.response.status}`;
                if (error.response.data && typeof error.response.data === 'object') {
                    if (error.response.data.code && error.response.data.message) {
                        errorMessage = `語音辨識服務錯誤: ${error.response.data.code} - ${error.response.data.message}`;
                    } else if (error.response.data.message) {
                        errorMessage += ` (${error.response.data.message})`;
                    } else {
                        errorMessage += ` (${JSON.stringify(error.response.data)})`;
                    }
                }
            } else if (error.request) {
                errorMessage = '語音辨識失敗: 無法連接到語音辨識服務。';
            } else {
                errorMessage = `語音辨識失敗: 請求錯誤 ${error.message}`;
            }
        } else {
            errorMessage = `語音辨識失敗: ${error.message || '未知錯誤'}`;
        }
        console.error(errorMessage, error);
        throw new Error(errorMessage);
    }
};

// 文本生成服務 (現在需要 type, subjective, objective)
export const generateText = async (type: 'FillTemplate' | 'SOAP', subjective: string, objective: string): Promise<string> => {
    try {
        // 傳送符合後端期望的數據結構
        const response = await axios.post(`${API_BASE_PATH}/chat/generate`, { 
            type: type, 
            subjective: subjective, 
            objective: objective 
        });

        const generatedText = response.data?.generated_text; 
        if (typeof generatedText === 'string') {
            return generatedText;
        } else {
            console.warn("API 回傳的 generated_text 不是字串或為空，回傳空字串。回傳資料:", response.data);
            return ''; 
        }
    } catch (error: any) {
        let errorMessage = '文字生成失敗';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error(`文字生成服務 HTTP 錯誤: ${error.response.status} - ${JSON.stringify(error.response.data)}\n`);
                errorMessage = `文字生成失敗: 服務錯誤 ${error.response.status}`;
                if (error.response.data && typeof error.response.data === 'object') {
                    if (error.response.data.detail) { 
                        errorMessage += `: ${JSON.stringify(error.response.data.detail)}`;
                    } else if (error.response.data.message) {
                        errorMessage += `: ${error.response.data.message}`;
                    } else {
                        errorMessage += `: ${JSON.stringify(error.response.data)}`; 
                    }
                }
            } else if (error.request) {
                errorMessage = '文字生成失敗: 無法連接到生成服務。';
            } else {
                errorMessage = `文字生成失敗: 請求錯誤 ${error.message}`;
            }
        } else {
            errorMessage = `文字生成失敗: ${error.message || '未知錯誤'}`;
        }
        console.error(errorMessage, error);
        throw new Error(errorMessage);
    }
};

