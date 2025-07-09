from fastapi import APIRouter, HTTPException, Request, Depends, status # 引入 status
from pydantic import BaseModel, Field
import json
import os
import sys
from models.user_model import User, get_tw_time
from datetime import datetime
import pytz
from .custom_template import get_current_username  # 引入 JWT 驗證依賴

router = APIRouter()
USER_DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "users.json")

class User(BaseModel):
    username: str = Field(...)
    password: str = Field(...)
    name: str = Field(...)
    department: str = Field(...)
    title: str = Field(...)
    role: str = Field(...)
    email: str = Field(...)
    phone: str = Field(...)
    status: str = Field(...)
    avatar: str = Field(...)
    note: str = Field(...)

def load_users():
    with open(USER_DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_users(users):
    with open(USER_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

@router.get("/users")
def list_users():
    users = load_users()
    return [user for user in users]

@router.post("/users")
def add_user(user: User):
    users = load_users()
    if any(u["username"] == user.username for u in users):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用戶已存在")
    
    now = get_tw_time().strftime('%Y-%m-%d %H:%M:%S')
    user_dict = user.dict()
    user_dict["created_at"] = now
    user_dict["updated_at"] = now
    user_dict["last_login"] = now
    users.append(user_dict)
    save_users(users)

    # === 新增：建立個人資料夾與預設檔案 ===
    base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
    user_dir = os.path.join(base_dir, user.username)
    try:
        os.makedirs(user_dir, exist_ok=True)
        # 複製 OPD_temp.json 為 OPD.json
        opd_temp = os.path.join(base_dir, "OPD_temp.json")
        opd_json = os.path.join(user_dir, "OPD.json")
        if os.path.exists(opd_temp):
            import shutil
            shutil.copyfile(opd_temp, opd_json)
        else:
            with open(opd_json, "w", encoding="utf-8") as f:
                f.write("{}")
        # 建立空的 subjective_question.txt 和 objective_question.txt
        subj_file = os.path.join(user_dir, "subjective_question.txt")
        obj_file = os.path.join(user_dir, "objective_question.txt")
        for fpath in [subj_file, obj_file]:
            if not os.path.exists(fpath):
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write("")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"建立使用者資料夾或預設檔案失敗: {str(e)}")
    # === 新增結束 ===

    return {"success": True, "username": user.username}

@router.put("/users/{username}")
async def update_user(username: str, request: Request, current_username: str = Depends(get_current_username)):
    data = await request.json()
    users = load_users()
    
    # 獲取當前操作者在 users.json 中的完整資料，以確認其角色
    current_operator = next((u for u in users if u["username"] == current_username), None)
    if not current_operator:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="操作者不存在")
    
    operator_role = current_operator.get("role")

    # 獲取目標使用者
    target_user = next((u for u in users if u["username"] == username), None)
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用戶不存在")

    # === 強化權限檢查 ===
    # 如果操作者不是 admin 或 manager，則只能修改自己的資料
    if operator_role == "user":
        if current_username != username:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="一般用戶只能修改自己的資料")
        
        # 一般用戶只能修改特定欄位，例如姓名、Email、電話、大頭貼、備註
        allowed_user_fields = ["name", "email", "phone", "avatar", "note"]
        for k in data:
            if k not in allowed_user_fields:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail=f"一般用戶無權修改 '{k}' 欄位"
                )
    
    # 角色修改的特殊權限檢查
    new_role = data.get("role")
    if new_role and new_role != target_user.get("role"): # 如果嘗試修改角色
        if username == "admin" and new_role != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="admin 帳號的身份不能被更改")
        if new_role == "admin" and operator_role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有 admin 可以將用戶角色設置為 admin")
        if target_user.get("role") == "manager" and operator_role != "admin" and current_username != username:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理員不能更改其他管理員的角色，除非是 admin 自己")
        if operator_role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有 admin 可以更改用戶角色")

    # 更新使用者資料
    for k, v in data.items():
        # 確保不會修改 username, created_at, updated_at, last_login
        if k not in ["username", "created_at", "updated_at", "last_login"]:
            # 如果是 admin 或 manager，可以修改所有非受保護欄位
            # 如果是 user，我們已在上面限制了可修改的欄位，所以這裡只需更新
            target_user[k] = v
    
    target_user["updated_at"] = get_tw_time().strftime('%Y-%m-%d %H:%M:%S')
    save_users(users)
    return {"success": True, "username": username}

@router.delete("/users/{username}")
async def delete_user(username: str, current_username: str = Depends(get_current_username)):
    users = load_users()
    current_user = next((u for u in users if u["username"] == current_username), None)
    if not current_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="操作者不存在")
    role = current_user.get("role")
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只有 admin 可以刪除用戶")
    
    for i, user in enumerate(users):
        if user["username"] == username:
            users.pop(i)
            save_users(users)
            return {"success": True, "username": username}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用戶不存在")

@router.put("/users/{username}/password")
async def change_password(username: str, request: Request, current_username: str = Depends(get_current_username)):
    data = await request.json()
    new_password = data.get("password")
    if not new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="新密碼不得為空")
    
    users = load_users()
    current_user_data = next((u for u in users if u["username"] == current_username), None)
    if not current_user_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="操作者不存在")
    
    operator_role = current_user_data.get("role")

    # 判斷權限：
    # admin/manager 可以修改所有人的密碼
    # user 只能修改自己的密碼
    if operator_role == "user" and current_username != username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="一般用戶只能修改自己的密碼")
    
    # 檢查目標用戶是否存在
    target_user_found = False
    for user_item in users:
        if user_item["username"] == username:
            user_item["password"] = new_password
            target_user_found = True
            break
    
    if not target_user_found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用戶不存在")

    save_users(users)
    return {"success": True, "username": username}

