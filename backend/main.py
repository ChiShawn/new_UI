from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

# 確保所有 router 都被正確匯入
from api.user import router as user_router
from api.login import router as login_router
from api.patient import router as patient_router
from api.icd import router as icd_router
from api.chat import router as chat_router 
from api.voice_api import router as voice_api_router

# --- 診斷性導入 template_router ---
try:
    from api.template import router as template_router 
    print("[DEBUG] 成功導入 api.template 模組。")
except ImportError as e:
    print(f"[CRITICAL ERROR] 導入 api.template 模組失敗: {e}")
    print(f"[CRITICAL ERROR] 請確認以下事項:")
    print(f"[CRITICAL ERROR] 1. 檔案是否存在: /home/phison/phison_doctor/new_UI/backend/api/template.py")
    print(f"[CRITICAL ERROR] 2. 檔案名稱是否正確 (包括大小寫)。")
    print(f"[CRITICAL ERROR] 3. /home/phison/phison_doctor/new_UI/backend/api/__init__.py 檔案是否存在 (即使是空的)。")
    print(f"[CRITICAL ERROR] 4. template.py 內部是否有語法錯誤。")
    print(f"[CRITICAL ERROR] 應用程式將無法啟動，因為缺少必要的路由。")
    template_router = None 
    sys.exit(1) 
except Exception as e:
    print(f"[CRITICAL ERROR] 導入 api.template 模組時發生未知錯誤: {type(e).__name__}: {e}")
    template_router = None
    sys.exit(1)


app = FastAPI()

# 允許您的前端來源
origins = [
    "http://localhost:3001",
    "http://10.28.141.12:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 路由註冊 ---
app.include_router(login_router, prefix="/auth", tags=["Authentication"])
app.include_router(user_router, prefix="/auth", tags=["Authentication"]) 
app.include_router(patient_router, prefix="/api", tags=["Patient"])
app.include_router(icd_router, prefix="/api/icd", tags=["ICD"])
app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
# 確保這裡的 prefix 是 /api/voice
app.include_router(voice_api_router, prefix="/api/voice", tags=["Voice"]) 

# 只有在 template_router 被成功導入時才掛載
if template_router:
    app.include_router(template_router, prefix="/api", tags=["Template"]) 
else:
    print("[CRITICAL WARNING] template_router 未被成功導入，'Template' 相關功能將不可用。")


# 根目錄的測試端點，用於確認伺服器是否正常運行
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Phison Doctor Backend is running"}

