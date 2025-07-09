from fastapi import APIRouter, File, UploadFile, HTTPException
import os
import io
import httpx
import json
import traceback # 新增：導入 traceback 模組

# 導入 get_auth_token 函式和 auth_token_cache
from .custom_template import get_auth_token, auth_token_cache, load_llm_config

# --- 引入音訊轉換庫 (您需要安裝 ffmpeg 和 pydub) ---
try:
    from pydub import AudioSegment
    # 這裡不需要 play，移除它
except ImportError:
    print("[ERROR] pydub 庫未安裝。音訊格式轉換功能將不可用。")
    print("請運行: pip install pydub")
    print("並確保您的系統已安裝 ffmpeg。")
    AudioSegment = None # 設置為 None，以便在後續代碼中進行檢查

router = APIRouter()

# 實際語音轉文字的核心函式
async def perform_actual_speech_to_text_conversion(audio_file_content: bytes, file_format: str) -> str:
    print(f"接收到音訊檔案，大小: {len(audio_file_content)} bytes. 正在準備進行地端語音辨識...")

    try:
        config = load_llm_config()
    except Exception as e:
        print(f"[ERROR] 載入 LLM 配置失敗 (在 voice_api.py 中): {e}")
        raise HTTPException(status_code=500, detail="無法載入地端 Whisper 配置。")

    whisper_url = config.get("whisper_url")
    whisper_file_field = config.get("whisper_file_field", "file")
    whisper_lang_param = config.get("whisper_lang_param_key", "language")
    whisper_lang_value = config.get("whisper_lang_param_value", "zh_TW")
    TARGET_AUDIO_FORMAT = config.get("whisper_target_audio_format", "m4a") 

    if not whisper_url:
        raise ValueError("Whisper URL 未設定，請檢查 config.json")

    processed_audio_content = audio_file_content
    processed_file_format = file_format
    # 修正：確保處理 ;codecs=opus 和 x-m4a
    processed_filename_ext = file_format.split('/')[-1].split(';')[0].replace('x-', '') if '/' in file_format else "bin" 
    
    # === 修正點：更健壯的音訊格式轉換邏輯 ===
    # 檢查是否需要轉換：只有當 pydub 可用，且輸入格式不是目標格式時才轉換
    # 或者如果原始格式是 webm (通常後端不直接支持)
    # 或者如果原始格式是 m4a (通常也需要轉換成通用格式如 wav/mp3)
    needs_conversion = AudioSegment and (
        (f"audio/{processed_filename_ext}" != f"audio/{TARGET_AUDIO_FORMAT}") or
        file_format.startswith("audio/webm") or
        file_format.startswith("audio/x-m4a") or # 包含 x-m4a
        file_format.startswith("audio/mp4") # 也考慮 mp4
    )

    if needs_conversion:
        print(f"[DEBUG] 檢測到音訊格式為 {file_format}，目標轉換為 {TARGET_AUDIO_FORMAT} 格式。")
        try:
            # 嘗試從 bytes 讀取原始音訊
            if file_format.startswith("audio/webm"):
                audio_segment = AudioSegment.from_file(io.BytesIO(audio_file_content), format="webm")
            elif file_format.startswith("audio/x-m4a") or file_format.startswith("audio/mp4"): # 處理 m4a/mp4
                audio_segment = AudioSegment.from_file(io.BytesIO(audio_file_content), format="m4a")
            else:
                # 對於其他格式，讓 pydub 嘗試自動檢測
                audio_segment = AudioSegment.from_file(io.BytesIO(audio_file_content)) 
                
            print(f"[DEBUG] pydub 成功讀取原始音訊 ({file_format})。持續時間: {audio_segment.duration_seconds:.2f}秒, 幀率: {audio_segment.frame_rate}Hz, 聲道: {audio_segment.channels}")

            # 將音訊轉換為目標格式的 bytes
            output_buffer = io.BytesIO()
            
            export_params = {}
            if TARGET_AUDIO_FORMAT == "wav":
                export_params['codec'] = "pcm_s16le" # 確保使用兼容性最好的 PCM
            elif TARGET_AUDIO_FORMAT == "mp3":
                export_params['codec'] = "libmp3lame" # 常用 MP3 編碼器
            
            audio_segment.export(output_buffer, format=TARGET_AUDIO_FORMAT, **export_params)
            
            output_buffer.seek(0) # 重置緩衝區指針
            processed_audio_content = output_buffer.read()
            processed_file_format = f"audio/{TARGET_AUDIO_FORMAT}"
            processed_filename_ext = TARGET_AUDIO_FORMAT
            print(f"[DEBUG] 成功將音訊轉換為 {processed_file_format} 格式。新大小: {len(processed_audio_content)} bytes")
            
            if not processed_audio_content:
                print(f"[WARNING] 轉換後的音訊內容為空，原始大小: {len(audio_file_content)} bytes。")

        except Exception as e:
            # 修正點：使用 traceback.format_exc() 獲取詳細錯誤堆棧
            print(f"[ERROR] 音訊轉換失敗 ({file_format} -> {TARGET_AUDIO_FORMAT}): {e}")
            print(f"詳細錯誤堆棧：\n{traceback.format_exc()}") # 打印詳細堆棧信息
            print(f"[WARNING] 轉換失敗，將以原始 {file_format} 格式繼續發送請求，但這可能導致地端服務錯誤。")
            # 如果轉換失敗，則仍使用原始內容
            processed_audio_content = audio_file_content
            processed_file_format = file_format
            processed_filename_ext = file_format.split('/')[-1].split(';')[0].replace('x-', '') if '/' in file_format else "bin"
    else: # pydub 不可用，或格式已經匹配目標，無需轉換
        print(f"[DEBUG] 音訊格式為 {file_format}，且無需轉換或無法進行轉換，將直接發送。")

    # 修正點：在發送前再次檢查 processed_audio_content 是否為空
    if not processed_audio_content:
        raise HTTPException(status_code=500, detail="音訊處理後內容為空，無法發送至 Whisper 服務。")

    try:
        auth_token = await get_auth_token()
        headers = {"Authorization": f"Bearer {auth_token}"}

        files_payload = {whisper_file_field: (f"audio.{processed_filename_ext}", processed_audio_content, processed_file_format)}
        full_whisper_url = f"{whisper_url}?{whisper_lang_param}={whisper_lang_value}"

        print(f"[DEBUG] 發送請求到地端 Whisper URL: {full_whisper_url}")
        print(f"[DEBUG] 發送的檔案欄位名稱: '{whisper_file_field}'")
        print(f"[DEBUG] 發送的檔案名稱 (給服務): 'audio.{processed_filename_ext}'")
        print(f"[DEBUG] 發送的檔案 MIME 類型: '{processed_file_format}'")
        print(f"[DEBUG] 發送的請求頭: {headers}") 

        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(full_whisper_url, files=files_payload, headers=headers)
        
        if response.status_code == 401:
            print("[DEBUG] 地端 Whisper 服務返回 401，嘗試刷新 Token...")
            auth_token_cache["token"] = None 
            auth_token = await get_auth_token() 
            headers["Authorization"] = f"Bearer {auth_token}"
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(full_whisper_url, files=files_payload, headers=headers)
        
        response.raise_for_status() 
        
        whisper_response_data = response.json()
        print(f"[DEBUG] 地端 Whisper 服務原始響應: {whisper_response_data}")

        transcribed_text = whisper_response_data.get("data", "")
        
        if not transcribed_text and "text" in whisper_response_data:
            transcribed_text = whisper_response_data.get("text", "")

        if not transcribed_text and "detail" in whisper_response_data:
            raise ValueError(f"地端 Whisper 服務響應無文本內容，詳細: {whisper_response_data.get('detail')}")
        
        if not transcribed_text:
            raise ValueError("地端 Whisper 服務未返回任何文本內容。")

        return transcribed_text
    except httpx.HTTPStatusError as e:
        print(f"[ERROR] 地端 Whisper 服務 HTTP 錯誤: {e.response.status_code} - {e.response.text}")
        try:
            error_detail = e.response.json()
            print(f"[ERROR] 地端 Whisper 服務詳細錯誤響應: {error_detail}")
        except json.JSONDecodeError:
            error_detail = e.response.text
            print(f"[ERROR] 地端 Whisper 服務原始錯誤響應文本: {error_detail}")
        raise HTTPException(status_code=500, detail=f"地端 Whisper 服務錯誤: {e.response.status_code} - {error_detail}")
    except httpx.RequestError as e:
        print(f"[ERROR] 無法連線至地端 Whisper 服務: {e}")
        raise HTTPException(status_code=500, detail=f"無法連線至地端 Whisper 服務: {e}")
    except json.JSONDecodeError as e:
        print(f"[ERROR] 解析地端 Whisper 響應 JSON 錯誤: {e}. Response text: {response.text}")
        raise HTTPException(status_code=500, detail=f"地端 Whisper 服務響應格式錯誤: {e}")
    except ValueError as e:
        print(f"[ERROR] 地端 Whisper 服務響應處理錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"地端 Whisper 服務響應處理錯誤: {e}")
    except Exception as e:
        print(f"[CRITICAL ERROR] 地端 Whisper 辨識時發生未預期錯誤: {type(e).__name__}: {e}")
        print(f"詳細錯誤堆棧：\n{traceback.format_exc()}") # 打印詳細堆棧信息
        raise HTTPException(status_code=500, detail=f"地端語音辨識時發生未知錯誤: {e}")


@router.post("/voicetotext")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...)
):
    if not file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="只接受音訊檔案。")

    try:
        audio_content = await file.read()
        file_format = file.content_type
        
        transcribed_text = await perform_actual_speech_to_text_conversion(audio_content, file_format)

        return {"text": transcribed_text}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        # 修正點：這裡也使用 traceback.format_exc()
        print(f"語音辨識處理失敗 (非 HTTPException): {e}")
        print(f"詳細錯誤堆棧：\n{traceback.format_exc()}") # 打印詳細堆棧信息
        raise HTTPException(status_code=500, detail=f"語音辨識處理失敗: {str(e)}")

