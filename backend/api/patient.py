# api/patient.py

from fastapi import APIRouter, Request, HTTPException, Query, Depends
import os
import json
from pathlib import Path # 導入 pathlib，用於更安全的檔案路徑操作
from pydantic import ValidationError # 導入 ValidationError 處理 Pydantic 轉換錯誤
from typing import List, Optional, Dict # 確保導入 Dict

from models.patient_model import Patient, ICDAssessment # 保留原有的模型，如果其他地方有用到
from models.chtno_patient_model import ChtnoPatient, ChtnoICDXAssessment # 導入新的 ChtnoPatient 模型

from .custom_template import get_current_username 

router = APIRouter()

# 使用 pathlib 確保跨平台相容性
BASE_DATA_DIR = Path(__file__).parent.parent / 'data' # 調整路徑，使用 Path 物件

# --- 輔助函式：根據 CHTNO 在特定用戶的 OPD.json 檔案中尋找病人資料 ---
def find_patient_by_chtno_in_user_opd_file(username: str, chtno_to_find: str) -> Optional[Dict]:
    """
    從指定用戶的 OPD.json 檔案中載入病人資料，並根據 CHTNO 進行比對。
    假設每個用戶的 OPD.json 檔案只包含一個病患的資料。
    """
    opd_file_path = BASE_DATA_DIR / username / "OPD.json"
    
    if not opd_file_path.is_file(): # 使用 Path 物件的方法檢查檔案是否存在
        print(f"[DEBUG] 用戶 {username} 的 OPD.json 檔案不存在: {opd_file_path}")
        return None
    
    try:
        with open(opd_file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        # 確保 CHTNO 匹配
        if str(data.get("CHTNO")) == str(chtno_to_find):
            return data
        else:
            print(f"[DEBUG] 用戶 {username} 的 OPD.json 中 CHTNO ({data.get('CHTNO')}) 不匹配請求的 CHTNO ({chtno_to_find})")
            return None
    except (json.JSONDecodeError, IOError) as e:
        print(f"[ERROR] 讀取或解析用戶 {username} 的 OPD.json 失敗: {e}")
        return None

# --- 新增輔助函式：直接載入指定用戶的 OPD.json 檔案內容 ---
def load_single_patient_from_user_opd_file(username: str) -> Optional[Dict]:
    """
    直接從指定用戶的 OPD.json 檔案中載入其病人資料。
    假設每個用戶的 OPD.json 檔案只包含一個病患的資料。
    """
    opd_file_path = BASE_DATA_DIR / username / "OPD.json"
    
    if not opd_file_path.is_file():
        print(f"[DEBUG] 用戶 {username} 的 OPD.json 檔案不存在: {opd_file_path}")
        return None
    
    try:
        with open(opd_file_path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            # 添加除錯輸出：打印從檔案中讀取到的原始資料 (限制長度以防過長)
            print(f"[DEBUG] 從 {opd_file_path} 讀取到的原始資料 (前500字): {str(raw_data)[:500]}...")
            return raw_data
    except (json.JSONDecodeError, IOError) as e:
        print(f"[ERROR] 讀取或解析用戶 {username} 的 OPD.json 失敗: {e}")
        return None
    except Exception as e:
        print(f"[ERROR] 讀取用戶 {username} 的 OPD.json 時發生未知錯誤: {e}")
        return None


# --- 主要 API 路由函式：根據當前登入用戶的 CHTNO 獲取病人資料 (保持返回 Patient 格式，如果需要) ---
@router.get("/patients/{chtno}", response_model=Patient) # 這個路由可以選擇返回 Patient 或 ChtnoPatient
async def get_patient_by_chtno(
    chtno: str,
    current_username: str = Depends(get_current_username)
):
    raw_data = find_patient_by_chtno_in_user_opd_file(current_username, chtno)

    if not raw_data:
        raise HTTPException(status_code=404, detail=f"找不到用戶 {current_username} 下病歷號為 {chtno} 的病人紀錄。")

    # 如果需要，這裡也可以將 raw_data 轉換為 ChtnoPatient 格式再返回
    # 例如: return ChtnoPatient.from_opd_data(raw_data)
    # 但為了兼容原有的 Patient 模型，這裡仍然使用 Patient
    transformed_assessment: List[ICDAssessment] = []
    if "ASSESSMENT" in raw_data and isinstance(raw_data["ASSESSMENT"], list):
        for item in raw_data["ASSESSMENT"]:
            if isinstance(item, dict):
                # 兼容處理 code/name 或 ICDX/ICDX_NAME
                if "code" in item:
                    transformed_assessment.append(ICDAssessment(code=item["code"], name=item.get("name", "")))
                elif "ICDX" in item:
                    transformed_assessment.append(ICDAssessment(ICDX=item["ICDX"], ICDX_NAME=item.get("ICDX_NAME", ""))) # 這裡應該是 ICDX/ICDX_NAME 對應 ChtnoICDXAssessment 模型的欄位

    raw_data["ASSESSMENT"] = transformed_assessment

    try:
        patient_model = Patient(**raw_data)
        return patient_model
    except ValidationError as e: # 使用 ValidationError 捕獲 Pydantic 錯誤
        print(f"[ERROR] 用戶 {current_username} 的病人資料 Pydantic 模型驗證失敗 (CHTNO: {chtno}): {e.errors()}")
        raise HTTPException(status_code=422, detail=e.errors()) # 返回 422 Unprocessable Entity
    except Exception as e:
        print(f"[ERROR] 用戶 {current_username} 的病人資料轉換失敗 (CHTNO: {chtno}): {e}. 原始資料: {raw_data}")
        raise HTTPException(status_code=500, detail=f"伺服器資料處理失敗: {e}.")

# --- 修改：直接載入當前用戶的 OPD.json 並轉換為 chtno.json 格式 ---
@router.get("/patients", response_model=List[ChtnoPatient]) # <-- response_model 修改為 List[ChtnoPatient]
async def get_patient_for_current_user(current_username: str = Depends(get_current_username)):
    """
    獲取當前登入用戶下的病人資料，並將其轉換為 chtno.json 格式。
    如果 OPD.json 存在且有效，則返回一個包含該病人資料的列表。
    """
    raw_data = load_single_patient_from_user_opd_file(current_username)
    
    if not raw_data:
        # 如果找不到資料，回傳空列表
        print(f"[DEBUG] get_patient_for_current_user: 為用戶 {current_username} 找到空資料或 OPD.json 不存在。")
        return [] 

    try:
        # 使用 ChtnoPatient 模型的 from_opd_data 方法進行轉換
        chtno_patient_model = ChtnoPatient.from_opd_data(raw_data)
        # 添加除錯輸出：打印轉換後模型中的 Subjective 和 ObjectiveDetails
        print(f"[DEBUG] 轉換後的 Subjective: {chtno_patient_model.Subjective}")
        print(f"[DEBUG] 轉換後的 ObjectiveDetails (前5個): {chtno_patient_model.ObjectiveDetails[:5] if chtno_patient_model.ObjectiveDetails else '無'}")
        return [chtno_patient_model] # 回傳一個包含轉換後病患資料的列表
    except ValidationError as e: # 捕獲 Pydantic 驗證錯誤
        print(f"[ERROR] 用戶 {current_username} 的 OPD.json 轉換為 ChtnoPatient 模型失敗: {e.errors()}")
        raise HTTPException(status_code=422, detail=e.errors()) # 返回 422 Unprocessable Entity
    except Exception as e:
        print(f"[ERROR] 處理用戶 {current_username} 病患資料時發生未知錯誤: {e}")
        raise HTTPException(status_code=500, detail="處理病患資料時發生內部錯誤")

# --- 輔助函數：儲存特定用戶的 OPD.json (恢復為用戶綁定儲存) ---
def save_patient_data_for_user(username: str, patient_data: Dict):
    patient_dir = BASE_DATA_DIR / username
    patient_dir.mkdir(parents=True, exist_ok=True) # 使用 Path.mkdir 確保目錄存在
    patient_file = patient_dir / "OPD.json"
    print(f"[DEBUG] 嘗試儲存資料到: {patient_file}")
    with open(patient_file, "w", encoding="utf-8") as f:
        json.dump(patient_data, f, ensure_ascii=False, indent=2)
    print(f"[DEBUG] 資料已儲存到: {patient_file}")

@router.post("/patients")
async def create_patient_for_user(
    request: Request, 
    current_username: str = Depends(get_current_username) 
):
    data = await request.json()
    print(f"[DEBUG] 接收到創建病人資料請求，用戶: {current_username}, 資料 (前200字): {str(data)[:200]}...")
    save_patient_data_for_user(current_username, data)
    return {"success": True, "chtno": data.get("CHTNO")}

@router.put("/patients/{chtno}")
async def update_patient_for_user(
    chtno: str,
    request: Request, 
    current_username: str = Depends(get_current_username) 
):
    data = await request.json()
    print(f"[DEBUG] 接收到更新病人資料請求，用戶: {current_username}, CHTNO: {chtno}, 資料 (前200字): {str(data)[:200]}...")
    if str(data.get("CHTNO")) != str(chtno):
        print(f"[ERROR] 請求路徑中的 CHTNO ({chtno}) 與資料中的 CHTNO ({data.get('CHTNO')}) 不符。")
        raise HTTPException(status_code=400, detail="請求路徑中的 CHTNO 與資料中的 CHTNO 不符。")
    
    save_patient_data_for_user(current_username, data)
    return {"success": True, "chtno": chtno}
