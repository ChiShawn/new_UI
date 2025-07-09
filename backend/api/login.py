# 【修正】: 移除開頭所有多餘的縮排
import os
import json
from fastapi import APIRouter, HTTPException, status # 引入 status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timedelta

from jose import jwt, JWTError
from models.user_model import User
from .custom_template import JWT_SECRET_KEY as SECRET_KEY, ALGORITHM 

router = APIRouter()

# --- 設定 ---
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
USERS_DB_FILE = os.path.join(DATA_DIR, "users.json")


class UserLogin(BaseModel):
    username: str
    password: str

# --- 輔助函式 ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM) 
    return encoded_jwt

def authenticate_user(username: str, password: str) -> Optional[User]:
    """
    從 users.json 檔案中讀取資料，驗證使用者帳號密碼。
    這個版本能處理字典或列表格式的 JSON。
    """
    if not os.path.exists(USERS_DB_FILE):
        print(f"[CRITICAL ERROR] 使用者資料庫檔案找不到！請確認路徑是否正確: {USERS_DB_FILE}")
        raise HTTPException(status_code=500, detail="伺服器設定錯誤：找不到使用者資料庫")
    
    try:
        with open(USERS_DB_FILE, "r", encoding="utf-8") as f:
            users_db: Union[Dict[str, Any], List[Dict[str, Any]]] = json.load(f)
    except json.JSONDecodeError:
        print(f"[CRITICAL ERROR] 使用者資料庫檔案 {USERS_DB_FILE} 格式錯誤，無法解析 JSON。")
        raise HTTPException(status_code=500, detail="伺服器設定錯誤：使用者資料庫損毀")

    user_data: Optional[Dict[str, Any]] = None

    if isinstance(users_db, dict):
        user_data = users_db.get(username)
    elif isinstance(users_db, list):
        for user_item in users_db:
            if user_item.get("username") == username:
                user_data = user_item
                break
    else:
        raise HTTPException(status_code=500, detail="使用者資料庫格式不支援")

    if not user_data:
        return None

    stored_password = user_data.get("password")
    if stored_password != password: # 這裡應該用更安全的密碼驗證方式，例如 hash
        return None

    return User(**user_data)


@router.post("/login")
async def login_for_access_token(form_data: UserLogin):
    user = authenticate_user(form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, # 使用 status.HTTP_401_UNAUTHORIZED
            detail="不正確的帳號或密碼",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # === 新增：檢查使用者狀態 ===
    if user.status == "inactive":
        print(f"[DEBUG] 被禁用帳號嘗試登入: {user.username}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, # 使用 403 Forbidden 更合適
            detail="此帳號已被禁用，請聯繫管理員。",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # ==========================

    access_token = create_access_token(data={"sub": user.username})
    
    return {
        "success": True,
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "name": user.name,
        "role": user.role,
        "title": user.title,
        "department": user.department
    }

