# api/chat.py

import os
import json
import httpx
import re
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

# --- 輔助函式：判斷是否應該移除某一行 (最終修訂版，修正組索引) ---
def should_remove_line(line: str) -> bool:
    """
    判斷給定的行是否應該被移除。
    移除條件：該行是 LLM 填充模板後，標題部分存在但內容為「無意義」數據。
    """
    original_line_stripped = line.strip()

    # 如果行本身就是空的，直接移除
    if not original_line_stripped:
        return True

    # --- 定義常見的模板標題 (這些會被考慮為模板結構的一部分) ---
    template_headers = [
        # 完整欄位名稱 (含冒號和空白)
        r'Chief Complaint:\s*', r'History of Present Illness:\s*', r'Past Medical History:\s*',
        r'Surgical History:\s*', r'Family History:\s*', r'Medication History:\s*',
        r'Allergy History:\s*', r'Social History:\s*', r'Sexual/Reproductive History:\s*',
        r'Review of Systems:\s*', r'Vital Signs:\s*', r'General Appearance:\s*',
        r'Physical Examination:\s*', r'Diagnostic Test Results:\s*', r'Imaging or Instrumentation Findings:\s*',
        r'Procedure Done:\s*', r'Others:\s*',
        r'Infertility for:\s*', r'Try to pregnancy:\s*', r'For prenatal care:\s*',
        r'Sono for:\s*', r'Data from patient statement:\s*', r'Post-partum check:\s*',
        r'Married:\s*', r'Sex:\s*', r'Birth control:\s*', r'LMP:\s*',
        r'MC:\s*', r'Dysmenorrhea:\s*', r'Menorrhagia:\s*', r'Pap smear:\s*',
        r'Systemic disease:\s*', r'Allergy:\s*', r'Occupation:\s*', r'PH:\s*',
        r'OP:\s*', r'Tumor size:\s*', r'Tumor invasion:\s*', r'refer from:\s*',
        r'lower abdominal pain:\s*', r'Previous OP Hx:\s*', r'Family history:\s*',
        r'Height:\s*', r'Weight:\s*',

        # Objective 中出現的短標題
        r'V:\s*', r'BMI:\s*', r'CM:\s*', r'AVF:\s*', r'Free:\s*',
        r'Speculum:\s*', r'Lifting pain:\s*', r'Motion tenderness:\s*',
        r'Adnexa:\s*', r'X:\s*', r'Smooth:\s*', r'Uterus:\s*',
        r'Not enlarged:\s*', r'PV:\s*', r'Bilateral:\s*', r'FHB:\s*',
        r'BP:\s*', r'PR:\s*', r'CX:\s*', r'corpus:\s*',
        r'adenomyosis:\s*', r'ET:\s*', r'Rt adnexa:\s*', r'Lt adnexa:\s*',
        r'C-D-s fluid:\s*', r'V&V:\s*', r'Cervix:\s*', r'Ulterus:\s*',
        r'tenderness:\s*', r'AMH:\s*', r'TSH:\s*', r'PRL:\s*',

        # 數字列表標記
        r'^\s*\d+\.\s*', # 匹配行開頭的 "1.", "2." 等

        # 處理沒有冒號，但可能是模板關鍵詞的行 (例如 "Gravida 1 Para 1")
        r'\bGravida\s*\d+\s*Para\s*\d+\b.*?(Vaginal Delivery\s*\[.*?\]\/Cesarean Section\s*\[.*?\])?',
    ]

    # --- 定義「無意義」內容模式 ---
    meaningless_content_patterns = [
        r'^\s*\[\s*\]\s*$',  # 匹配獨立的空方括號，例如 "[]"
        r'^\s*\[\s*no\s*data\s*\]\s*$', # 匹配獨立的 [no data]
        r'^\s*\[\s*0\s*\]\s*$', # 匹配獨立的 [0]
        r'^\s*no\s*data\s*$', # 匹配獨立的 "no data"
        r'^\s*0\s*$', # 匹配獨立的 "0"
        r'^\s*none\s*$', # 匹配獨立的 "none"
        r'^\s*N\/A\s*$', # 匹配獨立的 "N/A"
        r'^\s*[\(\):,;\-\+\*\/\[\]\s]*$', # 只包含標點符號和空白的行
        # 處理 LLM 可能生成的特殊字符行
        r'^\s*-\s*$', # 只有一個連字符
        r'^\s*\*\s*$', # 只有一個星號
    ]

    # --- 策略：檢查是否是「空數據模板行」 ---
    # 如果一行是以 template_headers 開頭，並且移除了 header 後，剩下的內容是「無意義」的，則移除
    for header_pattern in sorted(template_headers, key=len, reverse=True):
        # 使用非捕獲組 (?:...) 和捕獲組 (.*?)
        # 現在 match.group(1) 會是 (.*?) 匹配到的內容
        match = re.match(r'^\s*(?:' + header_pattern + r')(.*?)$', original_line_stripped, re.IGNORECASE)
        
        if match:
            # 獲取 group(1) 的內容，這個才是標題後面的實際內容部分
            content_after_header = match.group(1) # <-- 這裡從 group(2) 改為 group(1)
            
            if content_after_header is None: 
                content_after_header = ""
            
            content_after_header_stripped = content_after_header.strip()
            
            # 檢查標題後的內容是否為「無意義」的內容
            is_meaningless = False
            for meaningless_pattern in meaningless_content_patterns:
                if re.fullmatch(meaningless_pattern, content_after_header_stripped, re.IGNORECASE):
                    is_meaningless = True
                    break
            
            # 如果標題後的內容是無意義的，並且該行被解析為一個模板行，則移除
            if is_meaningless:
                print(f"[DEBUG_REMOVE] 移除空數據模板行: '{original_line_stripped}'")
                return True
            else:
                # 如果找到標題且內容有意義，則這行不應該被移除
                return False 

    # --- 額外處理：對於那些沒有明確模板標題的行，直接檢查是否為「無意義」內容 ---
    for meaningless_pattern in meaningless_content_patterns:
        if re.fullmatch(meaningless_pattern, original_line_stripped, re.IGNORECASE):
            print(f"[DEBUG_REMOVE] 移除獨立的無意義行: '{original_line_stripped}'")
            return True

    # 如果以上條件都不滿足，則認為這行有實際意義，不移除
    return False

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

    template_type = 'subjective' if req.type == 'FillTemplate' else 'objective'
    template_file_path = os.path.join(DATA_DIR, current_user, f"{template_type}_question.txt")

    custom_prompt_template = ""
    if os.path.exists(template_file_path):
        with open(template_file_path, "r", encoding="utf-8") as f:
            custom_prompt_template = f.read()

    messages = []

    if req.type == 'FillTemplate':
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
        
        messages.append({"role": "system", "content": DEFAULT_FILLTEMPLATE_SYSTEM_PROMPT})

        if custom_prompt_template:
            processed_template = custom_prompt_template.replace('[subjective]', '{subjective}')
            
            messages.append({"role": "user", "content": (
                f"{processed_template.format(subjective=req.subjective)}\n" 
                f"\n--- 參考主觀數據 ---\n" 
                f"{req.subjective}"
            )})
            print(f"[DEBUG] 使用者 {current_user} 的 'FillTemplate' 自定義提示詞 (包含主觀資訊佔位符，將使用嚴格系統指令進行填充)。")
        else:
            messages.append({"role": "user", "content": (
                f"{DEFAULT_SUBJECTIVE_TEMPLATE_STRUCTURE}\n" 
                f"\n--- 參考主觀數據 ---\n" 
                f"{req.subjective}" 
            )})
            print(f"[DEBUG] 使用者 {current_user} 未設定 'FillTemplate' 自定義提示詞，將使用結構化預設提示詞。")

    elif req.type == 'SOAP':
        DEFAULT_SOAP_TEMPLATE_STRUCTURE = (
            "1. Vital Signs:[]\n"
            "2. General Appearance:[]\n"
            "3. Physical Examination:[]\n"
            "4. Diagnostic Test Results:[]\n"
            "5. Imaging or Instrumentation Findings:[]\n"
            "6. Procedure Done:[]\n"
            "7. Others:[]"
        )

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
                f"{DEFAULT_SOAP_TEMPLATE_STRUCTURE}\n" 
                f"\n--- 參考數據 ---\n" 
                f"主觀資訊:\n{req.subjective}\n\n" 
                f"客觀資訊:\n{req.objective}" 
            )})
            print(f"[DEBUG] 使用者 {current_user} 未設定 'SOAP' 自定義提示詞，將使用結構化預設提示詞。")

    else:
        raise HTTPException(status_code=400, detail="無效的生成類型")

    try:
        auth_token = await get_auth_token()
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
            if should_remove_line(line):
                continue
            processed_lines.append(line)
        
        final_generated_text = "\n".join(processed_lines).strip()

        print(f"[DEBUG] LLM 原始輸出:\n{ai_message}")
        print(f"[DEBUG] LLM 後處理輸出:\n{final_generated_text}")
        
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
