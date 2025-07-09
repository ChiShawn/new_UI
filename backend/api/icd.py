# backend/api/icd.py

import os
import json
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
import csv
import sys
import difflib

# --- 導入 OpenCC 相關 (如果已安裝) ---
try:
    from opencc import OpenCC
    _converter = OpenCC('s2twp') 
    print("[DEBUG] OpenCC 簡繁轉換器初始化成功。")
except ImportError:
    _converter = None
    print("[WARNING] opencc-python-reimplementation 未安裝。簡體轉繁體功能將不可用。請運行: pip install opencc-python-reimplementation")

from .custom_template import get_current_username, get_auth_token, load_llm_config

router = APIRouter()

# --- 全局變數或緩存，用於儲存 ICD 數據 ---
try:
    MAIN_FILE_PATH = os.path.abspath(sys.modules['main'].__file__)
    PROJECT_ROOT = os.path.dirname(os.path.dirname(MAIN_FILE_PATH))
    ICDX_CSV_PATH = os.path.join(PROJECT_ROOT, "frontend", "public", "ICDX.csv")
except KeyError:
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ICDX_CSV_PATH = os.path.join(PROJECT_ROOT, "frontend", "public", "ICDX.csv")
    print("[WARNING] 'main' 模組未在 sys.modules 中找到，使用備用路徑推導 ICDX.csv。")

print(f"[DEBUG] ICDX_CSV_PATH 最終解析為: {ICDX_CSV_PATH}")


_icd_data_cache: List[Dict[str, str]] = []
_icd_search_map: Dict[str, Dict[str, str]] = {} 


def normalize_icd_code(code: str) -> str:
    """規範化 ICD 代碼，移除可能的小數點，轉大寫，以便匹配"""
    return code.replace('.', '').strip().upper() 

def load_icd_data():
    """載入 ICDX.csv 數據並建立搜尋映射"""
    global _icd_data_cache, _icd_search_map
    if not _icd_data_cache: 
        print(f"[DEBUG] 正在嘗試載入 ICDX.csv 數據，路徑: {ICDX_CSV_PATH}")
        if not os.path.exists(ICDX_CSV_PATH):
            print(f"[CRITICAL ERROR] ICDX.csv 檔案未找到或無權限讀取: {ICDX_CSV_PATH}")
            return 
        try:
            with open(ICDX_CSV_PATH, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                _icd_data_cache = [row for row in reader]
                
            _icd_search_map = {normalize_icd_code(row['Icdx']): row for row in _icd_data_cache if 'Icdx' in row}
            print(f"[DEBUG] ICDX.csv 數據載入完成，共 {len(_icd_data_cache)} 條記錄，{len(_icd_search_map)} 個唯一規範化 ICD 碼。")
        except Exception as e:
            print(f"[CRITICAL ERROR] 載入 ICDX.csv 數據失敗: {e}", exc_info=True)


class ICDRequest(BaseModel):
    subjective_text: str

class ICDResponse(BaseModel):
    code: str
    name: str 

class RetrievedICDInfo(BaseModel):
    code: str
    ename: str
    cname: str

# 修正：改進檢索邏輯，降低相似度門檻
def retrieve_relevant_icds(query: str, top_k: int = 5, similarity_threshold: float = 0.1) -> List[RetrievedICDInfo]: # 將默認門檻從 0.3 降低到 0.1
    """
    根據查詢從本地 ICD 數據中檢索最相關的 ICD 碼，使用模糊匹配。
    """
    if not _icd_data_cache:
        load_icd_data() 

    if not _icd_data_cache: 
        print("[WARNING] ICD 數據未載入，無法執行 RAG 檢索。")
        return []

    relevant_icds_with_score = []
    lower_query = query.lower()

    for item in _icd_data_cache:
        icdx = item.get('Icdx', '').strip()
        ename = item.get('Ename', '').strip()
        cname = item.get('Cname', '').strip()
        alias = item.get('Alias', '').strip()

        # 計算與查詢的相似度
        max_score = 0
        if icdx:
            max_score = max(max_score, difflib.SequenceMatcher(None, lower_query, icdx.lower()).ratio())
        if ename:
            max_score = max(max_score, difflib.SequenceMatcher(None, lower_query, ename.lower()).ratio())
        if cname:
            max_score = max(max_score, difflib.SequenceMatcher(None, lower_query, cname.lower()).ratio())
        if alias:
            max_score = max(max_score, difflib.SequenceMatcher(None, lower_query, alias.lower()).ratio())
        
        if max_score >= similarity_threshold:
            relevant_icds_with_score.append({
                "icd_info": RetrievedICDInfo(code=icdx, ename=ename, cname=cname),
                "score": max_score
            })
    
    # 按分數排序，取 top_k
    relevant_icds_with_score.sort(key=lambda x: x["score"], reverse=True)
    relevant_icds = [item["icd_info"] for item in relevant_icds_with_score[:top_k]]

    print(f"[DEBUG] 檢索到 {len(relevant_icds)} 個相關 ICD 碼 (基於相似度 {similarity_threshold})。")
    return relevant_icds

@router.post("/infer", response_model=List[ICDResponse])
async def infer_icd_codes(
    req: ICDRequest,
    current_user: str = Depends(get_current_username)
):
    load_icd_data() 

    config = load_llm_config()
    llm_api_url = config.get("openai_api_base")
    llm_model = config.get("llm_model")

    if not llm_api_url or not llm_model:
        raise HTTPException(status_code=500, detail="LLM 設定不完整，請檢查 config.ini")

    # --- RAG 步驟 1: 檢索相關 ICD 碼 ---
    retrieved_icds = retrieve_relevant_icds(req.subjective_text, top_k=10, similarity_threshold=0.1) # 這裡也調整為 0.1

    retrieval_context = ""
    if retrieved_icds:
        retrieval_context = "\n\n請參考以下相關的 ICD-10 代碼列表，以及它們的英文和中文描述：\n"
        for idx, icd_info in enumerate(retrieved_icds):
            retrieval_context += (
                f"{idx + 1}. 代碼: {icd_info.code}, 英文: {icd_info.ename}"
                f"{', 中文: ' + icd_info.cname if icd_info.cname else ''}\n"
            )
        retrieval_context += "\n"
        print(f"[DEBUG] RAG 提示詞將包含檢索到的 ICD 數據：\n{retrieval_context}")
    else:
        print("[DEBUG] 未檢索到相關 ICD 碼，RAG 提示詞將不包含額外上下文。")


    prompt = (
        "你是一位專業的醫學編碼專家。"
        "請根據以下病歷主訴，生成最相關的 ICD-10 診斷碼建議。"
        "請務必從你的知識庫或提供的參考列表中選擇最準確的代碼。如果提供參考列表，請優先使用其中的代碼，並提供其**繁體中文名稱**（如果可用）。"
        "請嚴格按照以下 JSON 格式回傳一個包含多個物件的陣列，不要包含任何額外的文字、解釋或 markdown 標籤：\n"
        "[{\"code\": \"代碼\", \"name\": \"診斷名稱\"}, {\"code\": \"代碼\", \"name\": \"診斷名稱\"}]\n\n"
        f"病歷主訴：\n{req.subjective_text}"
        f"{retrieval_context}" 
    )
    
    try:
        auth_token = await get_auth_token()
        payload = {
            "model": llm_model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 512,
            "temperature": 0.2
        }
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            llm_response = await client.post(llm_api_url, json=payload, headers=headers)
        
        llm_response.raise_for_status() 
        response_data = llm_response.json()
        
        ai_message = response_data["choices"][0]["message"]["content"]
        print(f"[DEBUG] LLM 原始回應: {ai_message}")

        if ai_message.strip().startswith("```json"):
            start_index = ai_message.find('[')
            end_index = ai_message.rfind(']')
            if start_index != -1 and end_index != -1:
                json_str = ai_message[start_index:end_index+1]
            else:
                raise json.JSONDecodeError("無法從 AI 回應中找到有效的 JSON 陣列", ai_message, 0)
        else:
            json_str = ai_message

        icd_list_raw = json.loads(json_str)

        final_icd_list: List[ICDResponse] = []
        for item in icd_list_raw: 
            code = item.get("code", "").strip()
            llm_name_raw = item.get("name", "").strip() 

            processed_name = llm_name_raw

            if _converter:
                try:
                    processed_name = _converter.convert(llm_name_raw)
                    if processed_name != llm_name_raw: 
                        print(f"[DEBUG] 簡體轉繁體: '{llm_name_raw}' -> '{processed_name}'")
                except Exception as e:
                    print(f"[WARNING] OpenCC 轉換失敗: {e}. 將使用原始名稱。")
            
            if code:
                # --- 修正點：調整後處理邏輯的優先級 ---
                # 優先順序：
                # 1. LLM 原始回應的名稱 (如果 LLM 已提供繁體中文，則這是首選)
                # 2. 如果 LLM 回應的是英文，則嘗試從 CSV 查找中文名稱
                # 3. 如果以上都沒有，則保持 LLM 回應的英文名稱（如果 LLM 回應的是英文）
                
                # 判斷 LLM 回應的名稱是否為英文 (包含 ASCII 字母，但沒有其他中文字符)
                # 這裡假設 LLM 如果回傳中文，不會包含英文字母
                # 或者，更可靠的判斷是：如果 OpenCC 轉換前後名稱相同且包含非 ASCII 字符，則認為是中文
                
                # 方法一 (簡化判斷)：如果 LLM 名稱包含中文字符，則視為中文
                is_llm_name_chinese = any('\u4e00' <= c <= '\u9fff' for c in llm_name_raw) # 檢查是否包含 CJK 字符
                
                if is_llm_name_chinese:
                    # 如果 LLM 原始回應就是中文，直接使用它 (經過 OpenCC 轉換後)
                    final_icd_list.append(ICDResponse(code=code, name=processed_name))
                else: 
                    # 如果 LLM 回應是英文，則嘗試從 CSV 查找中文
                    found_in_csv = _icd_search_map.get(normalize_icd_code(code))
                    if found_in_csv and found_in_csv.get('Cname'):
                        final_icd_list.append(ICDResponse(code=code, name=found_in_csv['Cname']))
                    else:
                        final_icd_list.append(ICDResponse(code=code, name=processed_name)) # CSV 無中文，保持 LLM 的英文
            
        print(f"[DEBUG] 最終處理後的 ICD 列表 (包含簡繁轉換嘗試): {final_icd_list}")
        return final_icd_list

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI 回應的 JSON 格式錯誤: {e}. AI原始回應: {ai_message}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"無法連線至 AI 模型服務: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"與 AI 模型溝通時發生未知錯誤: {e}")

