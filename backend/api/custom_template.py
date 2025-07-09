# /home/phison/phison_doctor/new_UI/backend/api/custom_template.py
import os
import json
import httpx
from fastapi import HTTPException, Depends, status 
from fastapi.security import OAuth2PasswordBearer 
from jose import jwt, JWTError

# JWT 相關配置 (請根據您的實際配置調整)
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "e0c3f5b8a9d1c7e6f2a4b8d0c9e7f1a3b5c7d9e2f4a8b0d1c3e5f7a9b2c4d6e8")
ALGORITHM = "HS256"

# OAuth2Scheme 定義，用於自動處理 Authorization header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token") 

# --- 設定 ---
auth_token_cache = {"token": None}
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

# --- 通用輔助函式：載入 LLM 配置 ---
# 修改此函式以在解析前移除 JSON 註釋，包括行內註釋，並打印診斷信息
def load_llm_config():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            raw_content = f.read()
            
            cleaned_content_lines = []
            for line in raw_content.splitlines():
                comment_start = line.find('//')
                if comment_start != -1:
                    if line[:comment_start].count('"') % 2 == 0:
                        cleaned_line = line[:comment_start].strip()
                        if cleaned_line: 
                            cleaned_content_lines.append(cleaned_line)
                        continue
                cleaned_content_lines.append(line.strip())
            
            cleaned_content = "\n".join(filter(None, cleaned_content_lines))

            if not cleaned_content.strip():
                raise ValueError(f"config.json 檔案為空或只包含註釋：{CONFIG_FILE}")

            parsed_config = json.loads(cleaned_content)
            
            # --- 新增的診斷信息 ---
            openai_key_in_config = parsed_config.get("openai_api_key")
            print(f"[診斷] load_llm_config 實際從 config.json 讀取到的 openai_api_key: '{openai_key_in_config}'")
            # --- 診斷信息結束 ---

            return parsed_config
    except json.JSONDecodeError as e:
        print(f"[ERROR] 載入 LLM 配置失敗: JSON 語法錯誤 - {e}") 
        print(f"錯誤發生在檔案: {CONFIG_FILE}, 行 {e.lineno}, 列 {e.colno}")
        print("警告：儘管已嘗試移除註釋，config.json 仍存在 JSON 語法問題。")
        print("請確保 config.json 是一個有效的 JSON 格式，無多餘逗號、不匹配的引號等非標準內容。")
        raise HTTPException(status_code=500, detail="系統設定檔格式錯誤，請檢查 config.json")
    except ValueError as e:
        print(f"[ERROR] 載入 LLM 配置失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"[ERROR] 載入 LLM 配置失敗: {e}") 
        raise HTTPException(status_code=500, detail="系統設定檔遺失、毀損或路徑不正確")

# --- 通用輔助函式：獲取認證 Token ---
async def get_auth_token():
    if auth_token_cache["token"]:
        return auth_token_cache["token"]
    config = load_llm_config() 
    login_data = {"account": config.get("token_account"), "password": config.get("token_password")}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(config.get("token_url"), data=login_data) 
        
        response.raise_for_status()
        token = response.json().get("data", {}).get("token")
        if not token:
            print("[ERROR] 從中控台取得的 Token 為空")
            raise HTTPException(status_code=500, detail="從中控台取得的 Token 為空")
        auth_token_cache["token"] = token
        return token
    except httpx.HTTPStatusError as e:
        print(f"[ERROR] 認證服務 HTTP 錯誤: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=500, detail=f"認證服務回應錯誤: {e.response.status_code} - {e.response.text}")
    except httpx.RequestError as e:
        print(f"[ERROR] 認證服務網路請求錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"無法連線至認證服務: {e}")
    except Exception as e:
        print(f"[ERROR] 認證服務發生未知錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"認證服務發生未知錯誤: {e}")

# --- JWT 驗證依賴 ---
async def get_current_username(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無法驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return username

