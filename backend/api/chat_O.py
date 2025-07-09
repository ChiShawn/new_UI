import os
import json
import httpx
import re # 確保 re 模組已導入
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from starlette.responses import JSONResponse
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR
import traceback 

from .custom_template import get_current_username, get_auth_token, load_llm_config, auth_token_cache 
from .voice_api import perform_actual_speech_to_text_conversion

# --- 設定 ---
router = APIRouter()
auth_token_cache = {"token": None}
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

# --- 資料模型與輔助函式 ---
class GenerateRequest(BaseModel):
    type: str
    subjective: str
    objective: str

async def get_auth_token():
    if auth_token_cache["token"]:
        return auth_token_cache["token"]
    config = load_llm_config()
    login_data = {"account": config.get("token_account"), "password": config.get("token_password")} 
    try:
        async with httpx.AsyncClient() as client:
            # 修正: 將 data=login_status 改為 data=login_data
            response = await client.post(config.get("token_url"), data=login_data)
        response.raise_for_status()
        token = response.json().get("data", {}).get("token")
        if not token:
            print("[ERROR] 從中控台取得的 Token 為空")
            raise HTTPException(status_code=500, detail="從中控台取得的 Token 為空")
        auth_token_cache["token"] = token
        return token
    except httpx.HTTPStatusError as e:
        print(f"[ERROR] 認證服務 HTTP 錯誤: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=500, detail=f"認證服務回應錯誤: {e.response.status_code} - {e.response.text}")
    except httpx.RequestError as e:
        print(f"[ERROR] 認證服務網路請求錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"無法連線至認證服務: {e}")
    except Exception as e:
        print(f"[ERROR] 認證服務發生未知錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"認證服務發生未知錯誤: {e}")

# --- 輔助函式：判斷是否應該移除某一行 ---
def should_remove_line(line: str) -> bool:
    """
    判斷給定的行是否應該被移除。
    移除條件：該行在移除所有「無意義」內容（如「no data」、0、空方括號）
    以及與模板相關的固定文字、標點後，該行變為空字串或只有空白。
    """
    original_line_stripped = line.strip()

    # 如果行本身就是空的，直接移除
    if not original_line_stripped:
        return True

    temp_line = original_line_stripped

    # --- 步驟 1: 移除所有已知的「無意義」數據模式 ---
    # 移除 [no data], [0], [] (包括其中的空白)
    temp_line = re.sub(r'\[\s*(?:no\s*data|0)?\s*\]', '', temp_line, flags=re.IGNORECASE)
    
    # 移除冒號後直接跟著的 "no data" 或 "0" (不區分大小寫)
    temp_line = re.sub(r':\s*(?:no\s*data|0|none|N\/A)\s*$', ':', temp_line, flags=re.IGNORECASE)
    
    # 移除獨立的 "no data", "0", "none", "N/A" (考慮作為單獨詞彙出現)
    temp_line = re.sub(r'\b(?:no\s*data|0|none|N\/A)\b', '', temp_line, flags=re.IGNORECASE)

    # --- 步驟 2: 移除所有已知模板的固定文字和結構性標點 ---
    # 確保順序：先移除較長的、特定的模式，再移除較短的、通用的標點。
    clean_patterns = [
        # 完整的欄位名稱 (含冒號和空白)
        r'\bChief Complaint:\s*', r'\bHistory of Present Illness:\s*', r'\bPast Medical History:\s*',
        r'\bSurgical History:\s*', r'\bFamily History:\s*', r'\bMedication History:\s*',
        r'\bAllergy History:\s*', r'\bSocial History:\s*', r'\bSexual/Reproductive History:\s*',
        r'\bReview of Systems:\s*', r'\bVital Signs:\s*', r'\bGeneral Appearance:\s*',
        r'\bPhysical Examination:\s*', r'\bDiagnostic Test Results:\s*', r'\bImaging or Instrumentation Findings:\s*',
        r'\bProcedure Done:\s*', r'\bOthers:\s*',
        r'\bInfertility for:\s*', r'\bTry to pregnancy:\s*', r'\bFor prenatal care:\s*',
        r'\bSono for:\s*', r'\bData from patient statement:\s*', r'\bPost-partum check:\s*',
        r'\bMarried:\s*', r'\bSex:\s*', r'\bBirth control:\s*', r'\bLMP:\s*',
        r'\bMC:\s*', r'\bDysmenorrhea:\s*', r'\bMenorrhagia:\s*', r'\bPap smear:\s*',
        r'\bSystemic disease:\s*', r'\bAllergy:\s*', r'\bOccupation:\s*', r'\bPH:\s*',
        r'\bOP:\s*', r'\bTumor size:\s*', r'\bTumor invasion:\s*', r'\brefer from:\s*',
        r'\blower abdominal pain:\s*', r'\bPrevious OP Hx:\s*', r'\bFamily history:\s*',
        r'\bHeight:\s*', r'\bWeight:\s*',

        # 結構性關鍵詞 (不含冒號，但可能有空白) - 確保這些詞語是獨立的
        r'\bGravida\b\s*', r'\bPara\b\s*', r'\bVaginal Delivery\b\s*', r'\bCesarean Section\b\s*', r'\bD\/I:\s*',
        r'\bSex\b', # 處理 Sex 後面直接跟數據的情況，例如 "Sex: normal"
        r'\bMarried\b', # 處理 Married 後面直接跟數據的情況
        r'\bLMP\b', r'\bMC\b', r'\bDysmenorrhea\b', r'\bMenorrhagia\b',
        r'\bPap smear\b', r'\bSystemic disease\b', r'\bAllergy\b',
        r'\bOccupation\b', r'\bPH\b', r'\bOP\b', r'\bTumor size\b', r'\bTumor invasion\b',
        r'\brefer from\b', r'\blower abdominal pain\b', r'\bPrevious OP Hx\b',
        r'\bFamily history\b', r'\bHeight\b', r'\bWeight\b',
        
        # 數字列表標記
        r'^\s*\d+\.\s*', # 匹配行開頭的 "1.", "2." 等

        # 通用標點符號，但要小心，以防誤刪數據中的標點 (例如日期中的 '/')
        r'[\(\):,;\-]', 
        r'/', # 移除斜線，例如 "VD[]/CS[]" 中的斜線
    ]
    
    for pattern in clean_patterns:
        temp_line = re.sub(pattern, '', temp_line, flags=re.IGNORECASE)

    # 移除所有連續的空白字符，並修剪行首尾的空白。
    temp_line = re.sub(r'\s+', ' ', temp_line).strip()
    
    # 步驟 3: 如果經過所有清理後，該行變為空字串，則判斷為可移除。
    return not bool(temp_line)

# --- handle_generate 函式 (其餘部分保持不變) ---
@router.post("/generate") 
async def handle_generate(
    req: GenerateRequest,
    current_user: str = Depends(get_current_username)
):
    config = load_llm_config()
    llm_api_url = config.get("openai_api_base")
    llm_model = config.get("llm_model")

    if not llm_api_url or not llm_model:
        raise HTTPException(status_code=500, detail="LLM 設定不完整")

    # 根據請求類型確定範本檔案路徑
    template_type = 'subjective' if req.type == 'FillTemplate' else 'objective'
    template_file_path = os.path.join(DATA_DIR, current_user, f"{template_type}_question.txt")

    custom_prompt_template = ""
    if os.path.exists(template_file_path):
        with open(template_file_path, "r", encoding="utf-8") as f:
            custom_prompt_template = f.read()

    # 最終傳遞給 LLM 的訊息列表
    messages = []

    if req.type == 'FillTemplate':
        # 更新預設的主觀模板結構 (SOAP 的 S)
        DEFAULT_SUBJECTIVE_TEMPLATE_STRUCTURE = (
            "Chief Complaint:[]\n"
            "History of Present Illness:[]\n"
            "Past Medical History:[]\n"
            "Surgical History:[]\n"
            "Family History:[]\n"
            "Medication History:[]\n"
            "Allergy History:[]\n"
            "Social History:[]\n"
            "Sexual/Reproductive History:[]\n"
            "Review of Systems:[]"
        )

        # 為 FillTemplate 定義一個明確的系統提示詞，使其行為類似 SOAP 模板填充
        DEFAULT_FILLTEMPLATE_SYSTEM_PROMPT = (
            "您是一個高效、自動化的醫療表單填充機器人，您的**唯一且絕對的任務**是**精確填寫**提供的「主觀病歷模板」中的**所有方括號 `[]`。**\n"
            "請**逐字逐句，嚴格按照**下方「參考主觀數據」部分提供的資訊來填充，**絕不能使用任何外部知識，絕不能生成任何新內容，絕不能推斷。**\n"
            "**絕對不要添加任何「參考數據」中未明確提及或無法直接推斷的額外詞語或概念。**\n" 
            "**如果資訊不存在或不明確，請在方括號 `[]` 中填入「無資料」（英文 \"no data\"），或保持空白。系統將會自動移除這些不包含實際數據的行。**\n" 
            "**您的輸出內容必須且僅限於** 填寫好的主觀病歷模板內容本身，**別無他物。**"
            "**絕對嚴禁包含任何引言、結論、解釋、額外文字、預設標題（例如 'Chief complaint:'）、額外區塊，以及任何 Markdown 格式。**\n"
            "請務必保持模板的**原始行數、原始排版和方括號 `[]` 的原始格式**。\n"
            "**絕對絕對不要重複輸出病歷模板的標題**，例如 'Chief complaint:' 等，這些已經是模板的一部分，您的任務只是填充。\n"
            "**所有填充內容必須嚴格使用英文。**\n"
            "**再次強調，您的輸出內容必須僅是提供的模板內容本身，不含任何其他字符或信息。**"
        )
        
        # 總是先添加系統提示詞
        messages.append({"role": "system", "content": DEFAULT_FILLTEMPLATE_SYSTEM_PROMPT})

        if custom_prompt_template:
            # 如果存在自定義提示詞，假定它就是用戶想要填充的模板結構
            # 確保它也包含 [subjective] 佔位符，並替換為 {subjective} 以便格式化
            processed_template = custom_prompt_template.replace('[subjective]', '{subjective}')
            
            messages.append({"role": "user", "content": (
                f"{processed_template.format(subjective=req.subjective)}\n" # 使用自定義模板
                f"\n--- 參考主觀數據 ---\n" 
                f"{req.subjective}"
            )})
            print(f"[DEBUG] 使用者 {current_user} 的 'FillTemplate' 自定義提示詞 (包含主觀資訊佔位符，將使用嚴格系統指令進行填充)。")
        else:
            # 如果沒有自定義範本，則使用預設的主觀模板結構
            messages.append({"role": "user", "content": (
                f"{DEFAULT_SUBJECTIVE_TEMPLATE_STRUCTURE}\n" # 注入預設的主觀模板
                f"\n--- 參考主觀數據 ---\n" 
                f"{req.subjective}" 
            )})
            print(f"[DEBUG] 使用者 {current_user} 未設定 'FillTemplate' 自定義提示詞，將使用結構化預設提示詞。")

    elif req.type == 'SOAP':
        # 更新預設的 SOAP 客觀段落模板結構 (SOAP 的 O)
        DEFAULT_SOAP_TEMPLATE_STRUCTURE = (
            "1. Vital Signs:[]\n"
            "2. General Appearance:[]\n"
            "3. Physical Examination:[]\n"
            "4. Diagnostic Test Results:[]\n"
            "5. Imaging or Instrumentation Findings:[]\n"
            "6. Procedure Done:[]\n"
            "7. Others:[]"
        )

        # 定義一個通用且極其嚴格的 System 訊息
        STRICT_SYSTEM_PROMPT = (
            "您是一個高效、自動化的醫療表單填充機器人，您的**唯一且絕對的任務**是**精確填寫**提供的病歷模板中的**所有方括號 `[]`。**\n"
            "請**逐字逐句，嚴格按照**下方「參考數據」部分提供的資訊來填充，**絕不能使用任何外部知識，絕不能生成任何新內容，絕不能推斷。**\n"
            "**絕對不要添加任何「參考數據」中未明確提及或無法直接推斷的額外詞語或概念。**\n" 
            "**如果資訊不存在或不明確，請在方括號 `[]` 中填入「無資料」（英文 \"no data\"），或保持空白。系統將會自動移除這些不包含實際數據的行。**\n" 
            "**您的輸出內容必須且僅限於** 填寫好的病歷模板內容本身，**別無他物。**"
            "**絕對嚴禁包含任何引言、結論、解釋、額外文字、預設標題（例如 'Chief Complaint:'）、額外區塊（例如『Next Steps』、『Planned Investigations』、『Additional Information』、『Additional Notes』、『Patient Education』、『Follow-Up』、『Additional Considerations』、『Current Status』等），以及任何 Markdown 格式（例如粗體符號 `**`、井字號 `#`、列表符號 `- *`、縮進等）。**\n"
            "請務必保持模板的**原始行數、原始排版和方括號 `[]` 的原始格式**。\n"
            "**絕對絕對不要重複輸出病歷模板的標題**，例如 'Chief Complaint:'、'Infertility for:' 等，這些已經是模板的一部分，您的任務只是填充。\n"
            "**所有填充內容必須嚴格使用英文。**\n"
            "**再次強調，您的輸出內容必須僅是提供的模板內容本身，不含任何其他字符或信息。**" 
        )

        if custom_prompt_template:
            # 將 [subjective] 和 [objective] 替換為格式化佔位符
            processed_template = custom_prompt_template.replace('[subjective]', '{subjective}')
            processed_template = processed_template.replace('[objective]', '{objective}')

            messages.append({"role": "system", "content": STRICT_SYSTEM_PROMPT}) 

            if '{subjective}' in processed_template and '{objective}' in processed_template:
                messages.append({"role": "user", "content": (
                    f"{processed_template.format(subjective=req.subjective, objective=req.objective)}\n"
                    f"\n--- 參考數據 ---\n" 
                    f"主觀資訊:\n{req.subjective}\n\n" 
                    f"客觀資訊:\n{req.objective}"
                )})
                print(f"[DEBUG] 使用者 {current_user} 的 'SOAP' 自定義提示詞 (包含主客觀資訊佔位符，使用嚴格系統指令)")
            else:
                # 如果自定義範本存在但沒有所有佔位符，也使用 STRICT_SYSTEM_PROMPT 和填充指令
                messages.append({"role": "system", "content": STRICT_SYSTEM_PROMPT})
                messages.append({"role": "user", "content": (
                    f"{processed_template}\n"
                    f"\n--- 參考數據 ---\n"
                    f"主觀資訊:\n{req.subjective}\n\n"
                    f"客觀資訊:\n{req.objective}"
                )})
                print(f"[DEBUG] 使用者 {current_user} 的 'SOAP' 自定義提示詞 (不包含所有必要佔位符，使用嚴格系統指令)，將主客觀資訊附加到末尾。")
        else:
            messages.append({"role": "system", "content": STRICT_SYSTEM_PROMPT})
            messages.append({"role": "user", "content": (
                f"{DEFAULT_SOAP_TEMPLATE_STRUCTURE}\n" # 注入您提供的模板
                f"\n--- 參考數據 ---\n" 
                f"主觀資訊:\n{req.subjective}\n\n" 
                f"客觀資訊:\n{req.objective}" 
            )})
            print(f"[DEBUG] 使用者 {current_user} 未設定 'SOAP' 自定義提示詞，將使用結構化預設提示詞。")

    else:
        raise HTTPException(status_code=400, detail="無效的生成類型")

    try:
        auth_token = await get_auth_token()
        # 更新 payload 以使用 messages 列表
        payload = {"model": llm_model, "messages": messages, "max_tokens": 1024, "temperature": 0.5} 
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=120.0) as client:
             llm_response = await client.post(llm_api_url, json=payload, headers=headers)

        if llm_response.status_code == 401:
            print("[DEBUG] LLM service returned 401, refreshing token...")
            auth_token_cache["token"] = None
            auth_token = await get_auth_token()
            headers["Authorization"] = f"Bearer {auth_token}"
            async with httpx.AsyncClient(timeout=120.0) as client:
                llm_response = await client.post(llm_api_url, json=payload, headers=headers)

        llm_response.raise_for_status()
        response_data = llm_response.json()
        ai_message = response_data["choices"][0]["message"]["content"]

        # --- 新增後處理邏輯：移除空方括號或「無資料」的行 ---
        processed_lines = []
        for line in ai_message.splitlines():
            # 使用 should_remove_line 輔助函數判斷是否移除
            if should_remove_line(line):
                print(f"[DEBUG] 移除空行/無資料行: '{line.strip()}'")
                continue # 跳過此行，不添加到 processed_lines
            processed_lines.append(line)
        
        # 重新組合處理過的行，並去除首尾空白
        final_generated_text = "\n".join(processed_lines).strip()

        print(f"[DEBUG] LLM 原始輸出:\n{ai_message}") # 打印原始輸出
        print(f"[DEBUG] LLM 後處理輸出:\n{final_generated_text}") # 打印後處理輸出
        
        return {"generated_text": final_generated_text}

    except httpx.HTTPStatusError as e:
        print(f"[ERROR] LLM 服務 HTTP 錯誤: {e.response.status_code} - {e.response.reason_phrase}. Response text: {e.response.text}")
        raise HTTPException(status_code=500, detail=f"LLM 服務回應錯誤: {e.response.status_code} - {e.response.text}")
    except httpx.RequestError as e:
        print(f"[ERROR] 無法連線至 LLM 服務: {e}")
        raise HTTPException(status_code=500, detail=f"無法連線至 LLM 服務: {e}")
    except Exception as e:
        print(f"[ERROR] LLM 溝通時發生未知錯誤: {e}")
        print(f"詳細錯誤堆棧：\n{traceback.format_exc()}") 
        raise HTTPException(status_code=500, detail=f"與 LLM 模型溝通時發生未知錯誤: {e}")


