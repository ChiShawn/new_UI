from pydantic import BaseModel
from typing import Optional, List

# 1. 定義一個乾淨、結構固定的 Assessment 模型
#    這與前端 patientService.ts 中的 ICDAssessment 介面對應。
class ICDAssessment(BaseModel):
    """代表單一診斷碼與名稱的標準模型"""
    code: str
    name: str

# 2. 定義符合您 OPD.json 檔案結構的 Patient 模型
#    我將名稱從 PatientData 改回 Patient，以解決您 api/patient.py 中的 ImportError
class Patient(BaseModel):
    """代表從 JSON 檔案讀取的病患資料模型"""
    CHTNO: str
    NAME: str
    AGE: int
    GENDER: str
    HEIGHT: Optional[float] = None
    WEIGHT: Optional[float] = None
    PULSE: Optional[int] = None
    BP: Optional[str] = None
    ALLERGY: Optional[str] = None
    CASENO: int
    SCHDATE: str
    IDENTITY: Optional[str] = None
    NOTE: Optional[str] = None
    SUBJECTIVE: str
    OBJECTIVE: str
    ASSESSMENT: List[ICDAssessment]

    class Config:
        # Pydantic v2 建議使用 model_config，如果是 v1 則用 class Config
        pass


