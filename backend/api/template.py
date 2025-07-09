from fastapi import APIRouter, HTTPException, Depends, Query, Request
import os
import json
from typing import Literal

# 導入 JWT 驗證依賴
from .custom_template import get_current_username # 用於獲取當前登入的用戶名

router = APIRouter()

# 數據儲存目錄的根路徑
# 假設用戶範本儲存在 data/{username}/ 目錄下
BASE_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))

# 獲取自定義範本
@router.get("/user/custom-template")
async def get_custom_template(
    type: Literal["subjective", "objective"], # 限定類型只能是 subjective 或 objective
    current_username: str = Depends(get_current_username) # 需要驗證用戶
):
    """
    獲取指定用戶的自定義範本內容。
    範本檔案儲存在 data/{username}/{type}_question.txt。
    """
    template_file_path = os.path.join(BASE_DATA_DIR, current_username, f"{type}_question.txt")

    if not os.path.exists(template_file_path):
        # 如果檔案不存在，返回空字串，而不是 404
        # 讓前端可以創建新範本
        print(f"[DEBUG] 用戶 {current_username} 的 {type} 範本檔案不存在: {template_file_path}")
        return {"content": ""}
    
    try:
        with open(template_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"content": content}
    except Exception as e:
        print(f"[ERROR] 讀取用戶 {current_username} 的 {type} 範本失敗: {e}")
        raise HTTPException(status_code=500, detail=f"讀取範本失敗: {e}")

# 儲存自定義範本
@router.post("/user/custom-template")
async def save_custom_template(
    request: Request,
    type: Literal["subjective", "objective"], # 限定類型
    current_username: str = Depends(get_current_username) # 需要驗證用戶
):
    """
    儲存指定用戶的自定義範本內容。
    """
    data = await request.json()
    content = data.get("content", "")

    user_data_dir = os.path.join(BASE_DATA_DIR, current_username)
    os.makedirs(user_data_dir, exist_ok=True) # 確保用戶資料夾存在

    template_file_path = os.path.join(user_data_dir, f"{type}_question.txt")

    try:
        with open(template_file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"message": f"{type} 範本儲存成功"}
    except Exception as e:
        print(f"[ERROR] 儲存用戶 {current_username} 的 {type} 範本失敗: {e}")
        raise HTTPException(status_code=500, detail=f"儲存範本失敗: {e}")

