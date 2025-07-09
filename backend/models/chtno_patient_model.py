# models/chtno_patient_model.py
from pydantic import BaseModel, Field
from typing import List, Optional
import re

class ChtnoICDXAssessment(BaseModel):
    ICDX: str
    ICDX_NAME: str

class ObjectiveDetail(BaseModel):
    key: str # 例如 "身高", "BMI", "Sono", "X-ray", "一般描述"
    value: str # 該細項的具體內容
    original_line: str # 儲存原始行，方便前端顯示和選擇

class ChtnoPatient(BaseModel):
    CHTNO: str
    NAME: str
    caseno: Optional[str] = None
    SCHDATE: Optional[str] = None
    EXEDEPT: Optional[str] = None
    EXEDR: Optional[str] = None
    Subjective: Optional[str] = None
    Objective: Optional[str] = None  # 這是最終組合的完整 Objective 字串
    Assessment: List[ChtnoICDXAssessment] = []
    ObjectiveDetails: List[ObjectiveDetail] = [] # 擴展後的 Objective 細項列表

    # === 新增：Information 區塊所需的獨立欄位 ===
    AGE: Optional[int] = None
    GENDER: Optional[str] = None
    HEIGHT: Optional[float] = None # 保持為 float 類型以匹配 OPD.json
    WEIGHT: Optional[float] = None # 保持為 float 類型以匹配 OPD.json
    BMI: Optional[float] = None 
    PULSE: Optional[int] = None
    BP: Optional[str] = None # 血壓通常是字串 "120/80"
    ALLERGY: Optional[str] = None
    IDENTITY: Optional[str] = None
    NOTE: Optional[str] = None
    # ============================================

    @classmethod
    def from_opd_data(cls, opd_data: dict):
        chtno_data = {}
        
        chtno_data["CHTNO"] = str(opd_data.get("CHTNO", ""))
        chtno_data["NAME"] = opd_data.get("NAME", "")
        chtno_data["caseno"] = str(opd_data.get("CASENO", "")) # 注意：您的 OPD.json 中是 caseno，而不是 CASENO
        chtno_data["SCHDATE"] = opd_data.get("SCHDATE", "")
        chtno_data["EXEDEPT"] = opd_data.get("EXEDEPT", "")
        chtno_data["EXEDR"] = opd_data.get("EXEDR", "")
        
        chtno_data["Subjective"] = opd_data.get("Subjective", "").replace('\n', '\r\n')

        # === 填充新增的 Information 欄位 ===
        chtno_data["AGE"] = opd_data.get("AGE")
        chtno_data["GENDER"] = opd_data.get("GENDER")
        chtno_data["HEIGHT"] = opd_data.get("HEIGHT")
        chtno_data["WEIGHT"] = opd_data.get("WEIGHT")
        # BMI 從原始資料獲取，如果原始資料沒有則嘗試計算
        if opd_data.get("BMI") is not None:
            chtno_data["BMI"] = opd_data.get("BMI")
        elif chtno_data["HEIGHT"] is not None and chtno_data["WEIGHT"] is not None and chtno_data["HEIGHT"] > 0:
            height_m = chtno_data["HEIGHT"] / 100
            chtno_data["BMI"] = round(chtno_data["WEIGHT"] / (height_m ** 2), 1)
        else:
            chtno_data["BMI"] = None

        chtno_data["PULSE"] = opd_data.get("PULSE")
        chtno_data["BP"] = opd_data.get("BP")
        chtno_data["ALLERGY"] = opd_data.get("ALLERGY")
        chtno_data["IDENTITY"] = opd_data.get("IDENTITY")
        chtno_data["NOTE"] = opd_data.get("NOTE")
        # ====================================

        # --- ObjectiveDetails 處理邏輯 (保持不變) ---
        # 優先使用 OPD.json 中已存在的 ObjectiveDetails
        if "ObjectiveDetails" in opd_data and isinstance(opd_data["ObjectiveDetails"], list):
            # 驗證並轉換為 ObjectiveDetail 列表
            parsed_details = []
            for item in opd_data["ObjectiveDetails"]:
                try:
                    parsed_details.append(ObjectiveDetail(**item))
                except Exception as e:
                    print(f"[WARNING] 無法解析 ObjectiveDetail 項目: {item}, 錯誤: {e}")
            chtno_data["ObjectiveDetails"] = parsed_details
            chtno_data["Objective"] = "\r\n".join([d.original_line for d in parsed_details])
        else:
            # 如果 OPD.json 中沒有 ObjectiveDetails，則執行原有的解析邏輯
            # 注意：此邏輯現在已非必要，因為 top-level fields 已經處理
            # 但為了兼容舊資料或 ObjectiveDetails 不存在的情況，可以保留。
            # 為了避免重複，請確保這裡不會創建與上方相同的 ObjectiveDetail。
            parsed_details: List[ObjectiveDetail] = []

            # 1. 處理生命徵象和身體數據（從 OPD.json 的獨立欄位中提取）
            # 這些已經在上面作為頂層屬性處理，這裡可以移除或調整以避免重複
            # 為了避免重複，我建議這裡只處理不在頂層屬性中的 ObjectiveDetails
            # 讓 ObjectiveDetails 列表更側重於 "檢查發現" 而非基本資料。
            # 如果您需要基本資料也出現在 ObjectiveDetails 中，則需要更精細的判斷。
            # 目前，這些基本資訊應該已經在頂層屬性中。

            # 2. 處理原始 OPD.json 的 Objective 文本內容，嘗試識別檢驗結果類型 (保持不變)
            opd_raw_objective_text = opd_data.get("Objective", "").replace('\n', '\r\n')
            
            examination_patterns = {
                "超音波 (Sono)": r"(?:sono|ultrasound|超音波):\s*(.*)",
                "X光 (X-ray)": r"(?:x-ray|xray|X光):\s*(.*)",
                "電腦斷層 (CT)": r"(?:CT|ct|電腦斷層):\s*(.*)",
                "核磁共振 (MRI)": r"(?:MRI|mri|核磁共振):\s*(.*)",
                "抽血 (Blood Test)": r"(?:blood test|lab results|抽血|血液檢查):\s*(.*)",
                "病理報告 (Pathology)": r"(?:pathology|病理):\s*(.*)",
            }

            processed_lines_indices = set()
            lines_from_raw_objective = opd_raw_objective_text.split('\r\n')

            for i, line in enumerate(lines_from_raw_objective):
                line_stripped = line.strip()
                if not line_stripped:
                    continue

                matched_category = None
                matched_value = None

                for category, pattern in examination_patterns.items():
                    match = re.match(pattern, line_stripped, re.IGNORECASE)
                    if match:
                        matched_category = category
                        matched_value = match.group(1).strip()
                        break

                if matched_category:
                    parsed_details.append(ObjectiveDetail(key=matched_category, value=matched_value, original_line=line_stripped))
                    processed_lines_indices.add(i)

            # 處理 Objective 中未被識別為特定檢查的普通文本
            for i, line in enumerate(lines_from_raw_objective):
                if i not in processed_lines_indices:
                    line_stripped = line.strip()
                    if line_stripped:
                        # 避免將基本生命徵象等文本作為 "一般描述" 重複添加，如果它們已經在頂層字段中
                        # 這裡需要一個更智能的過濾，以避免重複顯示。
                        # 最好的做法是，如果 OPD.json 已經提供了 ObjectiveDetails，則直接使用。
                        # 否則，從原始 Objective 文本中解析並創建 ObjectiveDetails
                        # 但因為我們現在優先使用 ObjectiveDetails，且頂層資訊已處理，
                        # 這裡可能只會捕捉到 "未分類" 的客觀描述。
                        parsed_details.append(ObjectiveDetail(key="一般描述", value=line_stripped, original_line=line_stripped))
            
            chtno_data["ObjectiveDetails"] = parsed_details
            chtno_data["Objective"] = "\r\n".join([d.original_line for d in parsed_details])


        # 轉換 Assessment 格式 (保持不變)
        transformed_assessment = []
        if "Assessment" in opd_data and isinstance(opd_data["Assessment"], list):
            for item in opd_data["Assessment"]:
                if isinstance(item, dict) and "code" in item:
                    transformed_assessment.append(ChtnoICDXAssessment(ICDX=item["code"], ICDX_NAME=item.get("name", "")))
                elif isinstance(item, dict) and "ICDX" in item:
                    transformed_assessment.append(ChtnoICDXAssessment(ICDX=item["ICDX"], ICDX_NAME=item.get("ICDX_NAME", "")))

        chtno_data["Assessment"] = transformed_assessment
        
        return cls(**chtno_data)
