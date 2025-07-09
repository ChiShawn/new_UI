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

    @classmethod
    def from_opd_data(cls, opd_data: dict):
        chtno_data = {}
        
        chtno_data["CHTNO"] = str(opd_data.get("CHTNO", ""))
        chtno_data["NAME"] = opd_data.get("NAME", "")
        chtno_data["caseno"] = str(opd_data.get("CASENO", ""))
        chtno_data["SCHDATE"] = opd_data.get("SCHDATE", "")
        chtno_data["EXEDEPT"] = opd_data.get("EXEDEPT", "")
        chtno_data["EXEDR"] = opd_data.get("EXEDR", "")
        
        chtno_data["Subjective"] = opd_data.get("Subjective", "").replace('\n', '\r\n')

        # --- ObjectiveDetails 處理邏輯 ---
        # 優先使用 OPD.json 中已存在的 ObjectiveDetails
        if "ObjectiveDetails" in opd_data and isinstance(opd_data["ObjectiveDetails"], list):
            # 驗證並轉換為 ObjectiveDetail 列表
            parsed_details = []
            for item in opd_data["ObjectiveDetails"]:
                try:
                    parsed_details.append(ObjectiveDetail(**item))
                except Exception as e:
                    print(f"[WARNING] 無法解析 ObjectiveDetail 項目: {item}, 錯誤: {e}")
                    # 如果解析失敗，可以選擇跳過或添加為通用描述
            chtno_data["ObjectiveDetails"] = parsed_details
            # 組合 Objective 文本，預設為所有解析出的細項的 original_line 組合
            chtno_data["Objective"] = "\r\n".join([d.original_line for d in parsed_details])
        else:
            # 如果 OPD.json 中沒有 ObjectiveDetails，則執行原有的解析邏輯
            parsed_details: List[ObjectiveDetail] = []

            # 1. 處理生命徵象和身體數據（從 OPD.json 的獨立欄位中提取）
            height_cm = opd_data.get("HEIGHT")
            weight_kg = opd_data.get("WEIGHT")
            pulse = opd_data.get("PULSE")
            bp = opd_data.get("BP")
            age = opd_data.get("AGE")
            gender = opd_data.get("GENDER")
            identity = opd_data.get("IDENTITY")
            allergy = opd_data.get("ALLERGY")
            note = opd_data.get("NOTE")

            if age is not None:
                parsed_details.append(ObjectiveDetail(key="年齡", value=str(age), original_line=f"年齡: {age} 歲"))
            if gender:
                parsed_details.append(ObjectiveDetail(key="性別", value=gender, original_line=f"性別: {gender}"))
            if height_cm is not None:
                parsed_details.append(ObjectiveDetail(key="身高", value=str(height_cm), original_line=f"身高: {height_cm} Cm"))
            if weight_kg is not None:
                parsed_details.append(ObjectiveDetail(key="體重", value=str(weight_kg), original_line=f"體重: {weight_kg} Kg"))
            
            bmi = None
            if height_cm is not None and weight_kg is not None and height_cm > 0:
                height_m = height_cm / 100
                bmi = round(weight_kg / (height_m ** 2), 1)
                parsed_details.append(ObjectiveDetail(key="BMI", value=str(bmi), original_line=f"BMI: {bmi}"))
            
            if pulse is not None:
                parsed_details.append(ObjectiveDetail(key="脈搏", value=str(pulse), original_line=f"脈搏: {pulse} 下/分"))
            if bp:
                parsed_details.append(ObjectiveDetail(key="血壓", value=bp, original_line=f"血壓: {bp} mmHg"))
            if allergy:
                parsed_details.append(ObjectiveDetail(key="過敏藥物", value=allergy, original_line=f"過敏藥物: {allergy}"))
            if identity:
                parsed_details.append(ObjectiveDetail(key="身份", value=identity, original_line=f"身份: {identity}"))
            if note:
                parsed_details.append(ObjectiveDetail(key="備註", value=note, original_line=f"備註: {note}"))

            # 2. 處理原始 OPD.json 的 Objective 文本內容，嘗試識別檢驗結果類型
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

            for i, line in enumerate(lines_from_raw_objective):
                if i not in processed_lines_indices:
                    line_stripped = line.strip()
                    if line_stripped:
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
