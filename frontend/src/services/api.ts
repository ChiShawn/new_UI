/**
 * 處理登出邏輯的輔助函式
 */
const logout = () => {
    // 清除所有在 localStorage 中的使用者登入資訊
    localStorage.removeItem('token');
    localStorage.removeItem('user'); // 這裡應該是 'user' 而不是 'userInfo', 'currentUser' 等
    // 根據 AuthContext.tsx，您只存儲了 'token' 和 'user'
    
    // 重新載入頁面，這將會重設 App 的狀態並因為 loggedIn 為 false 而顯示登入畫面
    window.location.reload();
};

/**
 * 具有自動認證處理功能的 fetch 封裝函式
 * @param url API 的 URL
 * @param options fetch 的選項
 * @returns Promise<any> 解析後的回應 body
 */
export const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('token');

    // 準備請求標頭 (headers)
    const headers = new Headers(options.headers || {});
    if (token) {
        headers.append('Authorization', `Bearer ${token}`);
    }
    // 如果沒有手動設定 Content-Type，預設為 application/json
    // 對於 POST/PUT 請求，如果 body 是 JSON，則 Content-Type 必須是 application/json
    if (!options.headers || !(options.headers as Headers).has('Content-Type')) {
       headers.append('Content-Type', 'application/json');
    }

    const response = await fetch(fullUrl, {
        ...options,
        headers,
    });

    // 檢查是否為 401 Unauthorized 錯誤
    if (response.status === 401) {
        // Token 無效或已過期，執行登出程序
        console.error('API Error: 401 Unauthorized. Token invalid or expired. Logging out...');
        logout();
        
        // 拋出一個錯誤來中斷當前的程式執行。
        // 因為頁面即將重新載入，這個錯誤可能不會被捕捉到。
        throw new Error('您的登入已逾期或無效，請重新登入。');
    }

    // 檢查其他非成功的 HTTP 狀態碼
    if (!response.ok) {
        // 嘗試從回應中解析出更詳細的錯誤訊息
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        console.error(`API Error: ${response.status} - ${response.statusText}`, errorData);
        throw new Error(errorData.detail || errorData.message || `發生未知的伺服器錯誤: ${response.status}`);
    }

    // 如果回應成功，則解析並回傳 JSON 資料
    // 處理沒有內容的回應 (例如 HTTP 204 No Content)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return response.json();
    } else {
        // 對於非 JSON 回應 (例如 200 OK 但無內容)，直接返回 undefined 或處理
        return; 
    }
};

// 【新增】: 實際處理登入請求的函數
interface LoginResponseData {
    success: boolean;
    access_token?: string;
    token_type?: string;
    username?: string;
    name?: string;
    role?: string;
    title?: string;
    department?: string;
    error?: string; // 處理後端可能的錯誤訊息
    detail?: string; // FastAPI 的 detail 錯誤訊息
    // 確保這裡的 interface 與後端 login.py 返回的內容完全一致
    // 您的 login.py 返回的是 access_token, token_type, username, name, role, title, department
}

interface LoginPayload {
    username: string;
    password: string;
}

const API_BASE_URL = 'http://localhost:9988'; // 確保這是您的後端實際運行地址

const api = {
    login: async (payload: LoginPayload): Promise<LoginResponseData & { data?: any }> => {
        try {
            // 注意：這裡直接使用 fetch，因為 AuthContext 的 login 函數需要完整的響應數據
            // 如果後端 /auth/login 期望的是 application/x-www-form-urlencoded
            // 則需要構建 FormData 或 URLSearchParams
            const formData = new URLSearchParams();
            formData.append('username', payload.username);
            formData.append('password', payload.password);

            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded', // 根據 login.py 的 UserLogin 假設
                },
                body: formData.toString(), // 發送 form-urlencoded 數據
            });

            const data = await response.json();

            if (response.ok) {
                // 成功登入，返回後端給的所有數據
                return { success: true, ...data };
            } else {
                // 登入失敗，返回錯誤信息
                console.error('Login API Error:', response.status, data);
                return { success: false, error: data.detail || data.message || '登入失敗' };
            }
        } catch (error: any) {
            console.error('Login request failed:', error);
            return { success: false, error: error.message || '無法連線到登入服務' };
        }
    },
    
    // 【新增】: 呼叫後端登出 API (如果有的話)
    // 您的 AuthContext.tsx 中的 logout 函數調用了 api.logout()
    logout: async () => {
        try {
            // 假設後端有一個 /auth/logout 端點
            // await authFetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
            console.log('Frontend logout triggered.');
        } catch (error) {
            console.error('Error during backend logout:', error);
        }
    },

    // 您可以將所有其他服務（例如 patientService 中的 getPatientByCaseno, savePatientData）
    // 透過 apiClient 進行呼叫。為了避免循環依賴，這裡不會導入 apiClient
    // 而是在每個 service 檔案中直接導入 apiClient
};

export default api; // 導出 api 物件

