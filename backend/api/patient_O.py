from fastapi import APIRouter, Request, HTTPException, Query, Depends
import os
import json
from models.patient_model import Patient, ICDAssessment
from typing import List, Optional

from .custom_template import get_current_username 

router = APIRouter()
BASE_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))

# --- 輔助函式：根據 CHTNO 在特定用戶的 OPD.json 檔案中尋找病人資料 ---
# 將名稱改為反映 CHTNO，並將比對邏輯改為 CHTNO
def find_patient_by_chtno_in_user_opd_file(username: str, chtno_to_find: str) -> Optional[dict]:
    """
    從指定用戶的 OPD.json 檔案中載入病人資料，並根據 CHTNO 進行比對。
    假設每個用戶的 OPD.json 檔案只包含一個病患的資料。
    """
    opd_file_path = os.path.join(BASE_DATA_DIR, username, "OPD.json")
    
    if not os.path.isfile(opd_file_path):
        print(f"[DEBUG] 用戶 {username} 的 OPD.json 檔案不存在: {opd_file_path}")
        return None
    
    try:
        with open(opd_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # 確保 CHTNO 匹配
        if str(data.get("CHTNO")) == str(chtno_to_find): # *** 修改這裡：從 CASENO 改為 CHTNO ***
            return data  # 找到了，直接回傳資料
        else:
            print(f"[DEBUG] 用戶 {username} 的 OPD.json 中 CHTNO ({data.get('CHTNO')}) 不匹配請求的 CHTNO ({chtno_to_find})")
            return None # CHTNO 不匹配
    except (json.JSONDecodeError, IOError) as e:
        print(f"[ERROR] 讀取或解析用戶 {username} 的 OPD.json 失敗: {e}")
        return None

# --- 新增輔助函式：直接載入指定用戶的 OPD.json 檔案內容 ---
# 此函數邏輯不變，因為它不依賴任何特定欄位進行比對
def load_single_patient_from_user_opd_file(username: str) -> Optional[dict]:
    """
    直接從指定用戶的 OPD.json 檔案中載入其病人資料，不進行 CASENO 比對。
    假設每個用戶的 OPD.json 檔案只包含一個病患的資料。
    """
    opd_file_path = os.path.join(BASE_DATA_DIR, username, "OPD.json")
    
    if not os.path.isfile(opd_file_path):
        print(f"[DEBUG] 用戶 {username} 的 OPD.json 檔案不存在: {opd_file_path}")
        return None
    
    try:
        with open(opd_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except (json.JSONDecodeError, IOError) as e:
        print(f"[ERROR] 讀取或解析用戶 {username} 的 OPD.json 失敗: {e}")
        return None


# --- 主要 API 路由函式：根據當前登入用戶的 CHTNO 獲取病人資料 ---
# 路由路徑和參數名稱都改為 chtno
@router.get("/patients/{chtno}", response_model=Patient) # *** 修改路由路徑和參數名稱為 chtno ***
async def get_patient_by_chtno( # *** 修改函數名稱為 get_patient_by_chtno ***
    chtno: str, # *** 修改參數名稱為 chtno ***
    current_username: str = Depends(get_current_username) 
):
    # 調用新的輔助函數，並傳遞 chtno
    raw_data = find_patient_by_chtno_in_user_opd_file(current_username, chtno) # *** 修改這裡，調用新的函數名稱並傳遞 chtno ***

    if not raw_data:
        # 錯誤訊息也改為 chtno
        raise HTTPException(status_code=404, detail=f"找不到用戶 {current_username} 下病歷號為 {chtno} 的病人紀錄。") # *** 修改錯誤訊息 ***

    # 轉換 ASSESSMENT 資料 (邏輯不變，確保與 Patient 模型兼容)
    transformed_assessment: List[ICDAssessment] = []
    if "ASSESSMENT" in raw_data and isinstance(raw_data["ASSESSMENT"], list):
        for item in raw_data["ASSESSMENT"]:
            if isinstance(item, dict):
                found_code_name_pair = False
                for key, value in item.items():
                    if not key.endswith("_NAME"):
                        code = value
                        name_key = f"{key}_NAME"
                        name = item.get(name_key, "")
                        transformed_assessment.append(ICDAssessment(code=code, name=name))
                        found_code_name_pair = True
                        break 
                if not found_code_name_pair and "code" in item and "name" in item:
                     transformed_assessment.append(ICDAssessment(code=item["code"], name=item["name"]))

    raw_data["ASSESSMENT"] = transformed_assessment

    # 將整理好的資料傳入 Patient 模型進行驗證並回傳
    try:
        patient_model = Patient(**raw_data)
        return patient_model
    except Exception as e:
        # 錯誤訊息也改為 chtno
        print(f"[ERROR] 用戶 {current_username} 的病人資料 Pydantic 模型驗證失敗 (CHTNO: {chtno}): {e}") # *** 修改錯誤訊息 ***
        raise HTTPException(status_code=500, detail=f"伺服器資料格式驗證失敗: {e}. 原始資料: {raw_data}")

# --- 恢復：直接載入當前用戶的 OPD.json ---
@router.get("/patients", response_model=List[Patient]) 
async def get_patient_for_current_user(current_username: str = Depends(get_current_username)):
    """
    獲取當前登入用戶下的病人資料 (直接載入 OPD.json 檔案，不篩選 CHTNO 或 CASENO)。
    如果 OPD.json 存在且有效，則返回一個包含該病人資料的列表。
    """
    raw_data = load_single_patient_from_user_opd_file(current_username)
    
    if not raw_data:
        return []

    transformed_assessment: List[ICDAssessment] = []
    if "ASSESSMENT" in raw_data and isinstance(raw_data["ASSESSMENT"], list):
        for item in raw_data["ASSESSMENT"]:
            if isinstance(item, dict):
                found_code_name_pair = False
                for key, value in item.items():
                    if not key.endswith("_NAME"):
                        code = value
                        name_key = f"{key}_NAME"
                        name = item.get(name_key, "")
                        transformed_assessment.append(ICDAssessment(code=code, name=name))
                        found_code_name_pair = True
                        break 
                if not found_code_name_pair and "code" in item and "name" in item:
                     transformed_assessment.append(ICDAssessment(code=item["code"], name=item["name"]))

    raw_data["ASSESSMENT"] = transformed_assessment

    try:
        patient_model = Patient(**raw_data)
        return [patient_model]
    except Exception as e:
        print(f"[ERROR] 用戶 {current_username} 的 OPD.json 模型驗證失敗: {e}. 原始資料: {raw_data}")
        return []

# 輔助函數：儲存特定用戶的 OPD.json (恢復為用戶綁定儲存)
def save_patient_data_for_user(username: str, patient_data: dict):
    patient_file = os.path.join(BASE_DATA_DIR, username, "OPD.json")
    os.makedirs(os.path.dirname(patient_file), exist_ok=True) 
    with open(patient_file, "w", encoding="utf-8") as f:
        json.dump(patient_data, f, ensure_ascii=False, indent=2)

@router.post("/patients")
async def create_patient_for_user(
    request: Request, 
    current_username: str = Depends(get_current_username) 
):
    data = await request.json()
    save_patient_data_for_user(current_username, data)
    # 返回 CHTNO 而不是 CASENO
    return {"success": True, "chtno": data.get("CHTNO")} # *** 修改這裡，返回 chtno ***

@router.put("/patients/{chtno}") # *** 修改路由路徑為 chtno ***
async def update_patient_for_user(
    chtno: str, # *** 修改參數名稱為 chtno ***
    request: Request, 
    current_username: str = Depends(get_current_username) 
):
    data = await request.json()
    # 比對 CHTNO
    if str(data.get("CHTNO")) != str(chtno): # *** 修改這裡，比對 CHTNO ***
        raise HTTPException(status_code=400, detail="請求路徑中的 CHTNO 與資料中的 CHTNO 不符。") # *** 修改錯誤訊息 ***
    
    save_patient_data_for_user(current_username, data)
    # 返回 CHTNO
    return {"success": True, "chtno": chtno} # *** 修改這裡，返回 chtno ***
