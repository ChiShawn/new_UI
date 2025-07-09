import json
import os
import sys

# 模擬 FastAPI 應用程式的環境來獲取 config.json 的實際路徑
# 假設此腳本與 main.py 在同一個目錄下，或者在 backend/api/ 目錄下
# 如果 custom_template.py 在 backend/api/custom_template.py
# 則 CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config.json")
# 意味著 config.json 應該在 backend/config.json

# 為了確保我們使用 custom_template.py 中實際使用的路徑邏輯，
# 我們將直接引用 custom_template.py 中的邏輯來構建路徑。
# 請確保此診斷腳本與您的 FastAPI 應用程式的相對路徑一致。

# 假設診斷腳本在 backend/ 目錄下運行
# 則 custom_template.py 的路徑是 backend/api/custom_template.py
# 所以我們需要找到 backend/ 目錄
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) # 這裡假設診斷腳本也在 backend/
API_DIR = os.path.join(BASE_DIR, "api")
CUSTOM_TEMPLATE_PATH = os.path.join(API_DIR, "custom_template.py")

# 重建 custom_template.py 中使用的 CONFIG_FILE 路徑邏輯
# __file__ 在 custom_template.py 中會是 backend/api/custom_template.py
# os.path.dirname(__file__) 就是 backend/api/
# os.path.dirname(os.path.dirname(__file__)) 就是 backend/
# 所以 config.json 應該在 backend/config.json
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(CUSTOM_TEMPLATE_PATH)), "config.json")


print(f"--- 診斷 config.json 載入問題 ---")
print(f"根據 custom_template.py 的邏輯，config.json 的預期路徑為: {CONFIG_FILE}")

try:
    if not os.path.exists(CONFIG_FILE):
        print(f"❌ 錯誤: 在預期路徑 {CONFIG_FILE} 找不到 config.json 檔案。")
        print(f"請確認 config.json 檔案是否存在於此位置。")
        sys.exit(1)

    print(f"✅ 檔案存在。嘗試讀取檔案內容並解析 JSON...")
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        # 讀取整個檔案內容以便檢查原始字元
        raw_content = f.read()
        
        # 嘗試解析 JSON
        config_data = json.loads(raw_content) # 使用 json.loads 解析字串

    print("\n--- JSON 解析結果 ---")
    print("✅ 恭喜！config.json 檔案的 JSON 語法解析成功！")
    print("解析後的內容預覽:")
    # 使用 indent=2 讓輸出更易讀
    print(json.dumps(config_data, indent=2, ensure_ascii=False)) 
    print("\n----------------------------------------------------")
    print("如果看到此訊息，則表示 json.load() 能夠正確解析該檔案。")
    print("問題可能在於 FastAPI 應用程式的啟動環境或特定中間件處理。")

except json.JSONDecodeError as e:
    print("\n--- JSON 解析錯誤 ---")
    print(f"❌ 嚴重錯誤：config.json 檔案的 JSON 語法解析失敗！")
    print(f"錯誤類型: {e.__class__.__name__}")
    print(f"錯誤訊息: {e}")
    print(f"錯誤發生位置: 行 {e.lineno}, 列 {e.colno} (字元 {e.pos})")
    print("\n--- 原始檔案內容預覽 (用於診斷) ---")
    # 打印錯誤發生點附近的內容，幫助用戶定位
    lines = raw_content.splitlines()
    start_line = max(0, e.lineno - 3)
    end_line = min(len(lines), e.lineno + 2)
    for i in range(start_line, end_line):
        print(f"{i+1:4d}| {lines[i]}")
        if i + 1 == e.lineno:
            print(f"    {' ' * (e.colno - 1)}^ 錯誤在此列")
    print("\n----------------------------------------------------")
    print("此錯誤表示儘管您認為檔案是正確的，但 Python 的 JSON 解析器在讀取時遇到了語法問題。")
    print("請仔細檢查錯誤訊息指示的行和列，確保：")
    print("1. 所有鍵和字串值都使用雙引號 \"\" 括起來。")
    print("2. 檔案中沒有註釋（例如 `//` 或 `/* */`）。")
    print("3. 沒有多餘的逗號（尤其是物件或陣列的最後一個元素後面）。")
    print("4. 沒有其他非標準 JSON 字符。")

except Exception as e:
    print("\n--- 未知錯誤 ---")
    print(f"❌ 診斷過程中發生未知錯誤: {type(e).__name__}: {e}")
    print("\n----------------------------------------------------")


