import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import '../styles/AstSection.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faSpinner, faLightbulb } from '@fortawesome/free-solid-svg-icons';
// 確保 ICDAssessment 是從 icdService 導入的，且 icdService 已 export 它
import { inferIcdCodes, ICDAssessment } from '../services/icdService'; 
import { useSpeechToText } from '../hooks/useSpeechToText'; 

// 擴展 ICDAssessment 以包含用於 UI 顯示的額外屬性
interface DisplayICDItem extends ICDAssessment {
  Icdx: string; 
  Ename: string; 
  Cname: string; 
  color: string; 
}

interface AstSectionProps {
  subjectiveText?: string;
  assessment?: ICDAssessment[];
  onChange?: (newAssessment: ICDAssessment[]) => void;
}

const icdColorMap: { [key: string]: string } = { 
  N: '#f7c9e6', D: '#c9a4e6', R: '#e6e3a4', Z: '#a4c9e6', O: '#a4e6b3', 
  C: '#e6a4a4', E: '#e6c6a4', T: '#b0b0b0', J: '#a4e6e6', K: '#bfa47a', 
  L: '#c9e6c9', A: '#7a9ae6', B: '#7ae6a4', G: '#a47ae6', H: '#e67a7a', 
  I: '#e6d67a', Q: '#7a8be6', Y: '#ffd600', F: '#888', M: '#8b5c2a', 
  P: '#e6a87a', S: '#7ae6e6', U: '#e67aa4', V: '#7a9be6', W: '#7ae6b3', 
  X: '#a47aa4' 
};

// 前端 ICD 代碼規範化函數
const normalizeIcdCode = (code: string): string => {
    return code.replace('.', '').trim().toUpperCase();
};

const AstSection: React.FC<AstSectionProps> = ({ subjectiveText = '', assessment = [], onChange }) => {
  // inferState 的型別定義，使用 status 判斷 loading 狀態
  const [inferState, setInferState] = useState<{ status: 'idle' | 'loading'; error?: string }>({ status: 'idle' });
  const [icdData, setIcdData] = useState<Array<{ Icdx: string; Ename: string; Cname: string; Alias: string }>>([]);
  const [icdMap, setIcdMap] = useState<Map<string, { Ename: string; Cname: string }>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ Icdx: string; Ename: string; Cname: string; Alias: string }>>([]);
  
  // selectedICDs 的初始值來自 assessment prop
  const [selectedICDs, setSelectedICDs] = useState<ICDAssessment[]>(assessment); 

  // --- 語音輸入相關狀態與 Hook ---
  const activeFieldRef = useRef<'search' | null>(null);
  const [currentSpeechText, setCurrentSpeechText] = useState(''); 

  // ICD 搜尋邏輯
  const handleSearch = useCallback(async (query: string) => {
    console.log(`[AstSection Debug] handleSearch called with query: "${query}"`);
    if (query.length < 2) {   
      setSuggestions([]);
      return;
    }
    
    if (icdData.length === 0) {
      console.warn("[AstSection Warn] ICD data not loaded yet, cannot perform search.");
      setSuggestions([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = icdData.filter(item => {
      const icdxMatch = item.Icdx && normalizeIcdCode(item.Icdx).includes(normalizeIcdCode(lowerQuery)); 
      const enameMatch = item.Ename && item.Ename.toLowerCase().includes(lowerQuery);
      const cnameMatch = item.Cname && item.Cname.toLowerCase().includes(lowerQuery);
      const aliasMatch = item.Alias && item.Alias.toLowerCase().includes(lowerQuery);
      
      return icdxMatch || enameMatch || cnameMatch || aliasMatch;
    });
    setSuggestions(filtered);

  }, [icdData]); 

  // 處理語音辨識的最終結果
  const handleFinalTranscript = useCallback((transcript: string) => {
    console.log("[AstSection Debug] handleFinalTranscript called. Final transcript:", transcript);
    if (activeFieldRef.current === 'search') {
      const finalQuery = searchTerm + (searchTerm ? ' ' : '') + transcript.trim();
      setSearchTerm(finalQuery); 
      setCurrentSpeechText(''); 
      handleSearch(finalQuery); 
    }
  }, [searchTerm, handleSearch]); 

  // 處理語音辨識的中間結果 (用於文字流)
  const handleInterimTranscript = useCallback((interimTranscript: string) => {
    console.log("[AstSection Debug] handleInterimTranscript called. Interim transcript:", interimTranscript);
    setCurrentSpeechText(interimTranscript); 
    handleSearch(interimTranscript); 
  }, [handleSearch]); 

  // 初始化 useSpeechToText Hook
  const { isListening, statusMessage, startListening, stopListening, setStatusMessage } = useSpeechToText({
    onTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript, 
    lang: 'zh-TW'
  });

  // 切換語音辨識狀態
  const toggleListening = useCallback((field: 'search') => {
    console.log(`[AstSection Debug] toggleListening clicked for field: ${field}.`); 
    console.log(`[AstSection Debug] Current isListening: ${isListening}, activeFieldRef.current: ${activeFieldRef.current}`); 
    
    const isCurrentlyListeningForThisField = isListening && activeFieldRef.current === field;
    if (isCurrentlyListeningForThisField) {
      console.log('[AstSection Debug] Stopping listening for the same field.');
      stopListening();
      activeFieldRef.current = null;
      if (currentSpeechText) { 
          console.log('[AstSection Debug] Processing remaining interim text as final on stop.');
          handleFinalTranscript(currentSpeechText); 
      }
      setCurrentSpeechText(''); 
    } else {
      console.log('[AstSection Debug] Starting listening for a new field or a fresh session.');
      if(isListening) { 
        console.log('[AstSection Debug] Stopping listening for a different field.');
        stopListening();
        if (currentSpeechText) { 
            handleFinalTranscript(currentSpeechText); 
        }
        setCurrentSpeechText(''); 
      }
      activeFieldRef.current = field;
      setCurrentSpeechText(''); 
      console.log('[AstSection Debug] currentSpeechText cleared before starting new session.');
      startListening(); 
      console.log('[AstSection Debug] startListening() called.'); 
    }
  }, [isListening, activeFieldRef, currentSpeechText, stopListening, startListening, handleFinalTranscript, setStatusMessage]);

  // 同步父組件傳入的 assessment prop
  useEffect(() => {
    console.log("[AstSection Debug] Current assessment prop updated:", assessment);
    const validAssessment = assessment.filter(item => item && typeof item.code === 'string' && item.code.trim() !== '')
                                      .map(item => ({ code: normalizeIcdCode(item.code), name: item.name || '' })); 
    setSelectedICDs(validAssessment);
  }, [assessment]);

  // 載入 ICDX.csv 資料
  useEffect(() => { 
    fetch('/ICDX.csv')
      .then(res => res.text())
      .then(text => { 
        const result = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() }); 
        setIcdData(result.data as any); 
        console.log("[AstSection Debug] ICDX.csv loaded successfully.");
      })
      .catch(err => {
        console.error("[AstSection Error] Error loading ICDX.csv:", err);
        setStatusMessage("載入 ICDX 資料失敗。"); 
      });
  }, [setStatusMessage]); 

  // 將 ICDX 資料轉換為 Map 供快速查找
  useEffect(() => { 
    if (icdData.length > 0) { 
      const map = new Map<string, { Ename: string; Cname: string }>(); 
      icdData.forEach(r => { 
        if (r.Icdx) { 
            map.set(normalizeIcdCode(r.Icdx), { Ename: r.Ename || '', Cname: r.Cname || '' }); 
        }
      }); 
      setIcdMap(map); 
      console.log("[AstSection Debug] icdMap populated. Size:", map.size);
    } 
  }, [icdData]);

  // 當搜尋框內容變化時 (手動輸入或語音結果觸發)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchTerm(query);
    handleSearch(query); 
  };

  // 點擊搜尋建議
  const handleSuggestionClick = useCallback((item: { Icdx: string; Ename: string; Cname: string; Alias: string }) => { 
    if (!onChange) return; 
    const entryCode = normalizeIcdCode(item.Icdx);
    const entryName = item.Cname || item.Ename || '';
    const entry: ICDAssessment = { code: entryCode, name: entryName }; 

    // 確保在檢查重複時，使用規範化後的 code
    if (selectedICDs.some(a => normalizeIcdCode(a.code) === entryCode)) { 
      setSearchTerm(''); 
      setSuggestions([]); 
      return; 
    } 
    const newSelectedICDs = [...selectedICDs, entry];
    setSelectedICDs(newSelectedICDs); 
    onChange(newSelectedICDs); 
    setSearchTerm(''); 
    setSuggestions([]); 
  }, [onChange, selectedICDs]);

  // 從列表中移除 ICD
  const handleRemoveIcd = useCallback((index: number) => { 
    if (onChange) {
      const newSelectedICDs = selectedICDs.filter((_, i) => i !== index);
      setSelectedICDs(newSelectedICDs); 
      onChange(newSelectedICDs); 
    }
  }, [onChange, selectedICDs]);

  // 處理 ICD 推論
  const handleInferICD = async () => {
    if (!subjectiveText) {
        setInferState({ status: 'idle', error: "請先完成主觀敘述 (S) 的內容。" });
        setTimeout(() => setInferState({ status: 'idle', error: undefined }), 3000);
        return;
    }
    setInferState({ status: 'loading', error: undefined }); 
    try {
      const inferredCodes = await inferIcdCodes(subjectiveText); 
      console.log("[AstSection Debug] Inferred ICD Codes from LLM (received by AstSection):", inferredCodes); 
      
      if (onChange) {
        const formattedInferred: ICDAssessment[] = inferredCodes.map(inf => ({
            code: inf.code ? normalizeIcdCode(inf.code) : '', 
            name: inf.name || '' 
        })).filter(inf => inf.code !== ''); 

        // 確保在檢查重複時，使用規範化後的 code
        const uniqueInferred = formattedInferred.filter(inf => 
            !selectedICDs.some(sel => normalizeIcdCode(sel.code) === normalizeIcdCode(inf.code)) 
        );
        
        const updatedICDs = [...selectedICDs, ...uniqueInferred];
        setSelectedICDs(updatedICDs); 
        onChange(updatedICDs); 
        console.log("[AstSection Debug] onChange prop called with new ICDs."); 
      }
      setInferState({ status: 'idle' });
    } catch (err: any) {
      setInferState({ status: 'idle', error: `ICD 推論失敗: ${err.message}` });
      setTimeout(() => setInferState({ status: 'idle', error: undefined }), 5000);
      console.error("[AstSection Error] ICD inference failed:", err); 
    }
  };

  // 準備顯示在表格中的 ICD 資料
  const displayedIcds = useMemo(() => { 
    console.log("[AstSection Debug] Recalculating displayedIcds. Current selectedICDs:", selectedICDs);
    
    if (icdMap.size === 0 && selectedICDs.length > 0) { 
        console.warn("[AstSection Warn] ICDX.csv data not fully loaded, displaying ICDs with partial info (no full Chinese name lookup from CSV).");
        return selectedICDs.map(item => {
            if (!item || typeof item.code !== 'string') return null;
            const code = normalizeIcdCode(item.code); 
            const color = icdColorMap[code.charAt(0).toUpperCase()] || '#e0e0e0';
            return { 
                Icdx: code, 
                Ename: item.name || '', 
                Cname: '', 
                color 
            } as DisplayICDItem; 
        }).filter((i): i is DisplayICDItem => i !== null); 
    } else if (icdMap.size === 0 && selectedICDs.length === 0) {
        return []; 
    }
    
    return selectedICDs.map(item => { 
      if (!item || typeof item.code !== 'string') return null; 
      const code = normalizeIcdCode(item.code); 
      const found = icdMap.get(code); 
      const color = icdColorMap[code.charAt(0).toUpperCase()] || '#e0e0e0'; 
      
      return { 
        Icdx: item.code, // 這裡顯示原始的 ICD 代碼 (帶小數點) 保持 UI 一致性
        Ename: found?.Ename || item.name || '', 
        Cname: found?.Cname || '', 
        color 
      } as DisplayICDItem; 
    }).filter((i): i is DisplayICDItem => i !== null); 
  }, [selectedICDs, icdMap, icdColorMap]); // 修正: 這裡確保包含 icdColorMap

  return (
    <div className="ast-card assessment">
      <div className="ast-header">
        <span className="ast-title">Assessment<span className="ast-section-sub">評估診斷</span></span>
      </div>
      <div className="ast-toolbar-row">
        {/* 使用 inferState.status === 'loading' 來判斷是否 loading */}
        <button className="ast-btn ast-green-btn" onClick={handleInferICD} disabled={inferState.status === 'loading' || !subjectiveText}>
            {inferState.status === 'loading' ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faLightbulb} />} 推論
        </button>
        <div style={{ position: 'relative', flex: 1, marginLeft: 8 }}>
          <input 
            className="ast-search" 
            placeholder="或手動輸入 ICD、關鍵字" 
            value={isListening && activeFieldRef.current === 'search' ? currentSpeechText : searchTerm} 
            onChange={handleSearchChange} 
          />
          {suggestions.length > 0 && (
            <div className="ast-suggestions">
              {suggestions.filter(i => !selectedICDs.some(sel => normalizeIcdCode(sel.code) === normalizeIcdCode(i.Icdx))).map((item, idx) => (
                <div key={`${item.Icdx}-${idx}`} className="ast-suggestion-item" onClick={() => handleSuggestionClick(item)}>
                  {item.Icdx} - {item.Cname} ({item.Ename})
                </div>
              ))}
            </div>
          )}
        </div>
        <button 
          className="ast-btn ast-red-btn" 
          onClick={() => toggleListening('search')} 
          disabled={false} 
        >
          {isListening ? '辨識中...' : <FontAwesomeIcon icon={faMicrophone} />}
        </button>
      </div>
      {/* 語音狀態通知 */}
      {statusMessage && <div style={{ color: 'blue', marginBottom: '10px', marginTop: '5px', textAlign: 'center' }}>{statusMessage}</div>}

      {inferState.error && <div className="ast-error-message">{inferState.error}</div>}
      <table className="ast-table">
        <thead><tr><th>項次</th><th>ICD代碼</th><th>英文</th><th>中文</th><th></th></tr></thead>
        <tbody>
          {/* 使用 inferState.status !== 'loading' 來判斷是否顯示 "尚無評估診斷碼" */}
          {displayedIcds.length === 0 && inferState.status !== 'loading' && !inferState.error && (
            <tr>
              <td colSpan={5} className="ast-no-data-message-cell"> 
                尚無評估診斷碼
              </td>
            </tr>
          )}
          {displayedIcds.map((row, idx) => (
            <tr key={`${row.Icdx}-${idx}`}>
              <td>{idx+1}</td>
              <td><span className="ast-icd-tag" style={{background: row.color}}>{row.Icdx}</span></td>
              <td>{row.Ename}</td>
              <td>{row.Cname}</td>
              <td><button className="ast-del" onClick={() => handleRemoveIcd(idx)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AstSection;

