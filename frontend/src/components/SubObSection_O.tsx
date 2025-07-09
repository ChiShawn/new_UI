import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import '../styles/SubObSection.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faFileAudio, faStar, faRobot, faSpinner, faFileLines, faPause, faCircleDot } from '@fortawesome/free-solid-svg-icons';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { getCustomTemplate, saveCustomTemplate } from '../services/templateService';
import { generateText, transcribeAudio } from '../services/chatService';

// Props 介面
interface SubObSectionProps {
  subjective?: string;
  objective?: string;
  onChange: (fields: { subjective: string; objective:string }) => void;
  onGenerateSOAP: (generatedText: string) => void;
}

// CustomTemplateModal 元件 Props 介面
interface CustomTemplateModalProps {
  isOpen: boolean;
  type: 'subjective' | 'objective';
  onClose: () => void;
  // 新增的回調函數，用於通知父元件範本已更新
  onSaveSuccess: (type: 'subjective' | 'objective', content: string) => void; 
}

// CustomTemplateModal 元件
const CustomTemplateModal: React.FC<CustomTemplateModalProps> = ({ isOpen, type, onClose, onSaveSuccess }) => {
    const [templateContent, setTemplateContent] = useState('');
    const [message, setMessage] = useState('');
    
    // 從 `templateService` 獲取自定義範本內容
    useEffect(() => { 
        if (isOpen) { 
            setMessage(''); 
            setTemplateContent(''); 
            const fetchTemplate = async () => { 
                try { 
                    const text = await getCustomTemplate(type); 
                    setTemplateContent(text); 
                } catch (err) { 
                    setMessage('讀取範本失敗'); 
                } 
            }; 
            fetchTemplate(); 
        } 
    }, [isOpen, type]);

    // 處理範本儲存邏輯
    const handleSave = async () => { 
        try { 
            setMessage('儲存中...'); 
            await saveCustomTemplate(type, templateContent); 
            setMessage('儲存成功！'); 
            // 成功儲存後，調用新的回調函數通知父元件
            onSaveSuccess(type, templateContent); 
            setTimeout(() => setMessage(''), 2000); 
        } catch (err) { 
            setMessage('儲存失敗'); 
        } 
    };

    if (!isOpen) return null;

    return (
        <div className="custom-modal-bg" onClick={onClose}>
            <div className="custom-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">編輯 {type === 'subjective' ? 'S' : 'O'} 自定義範本</div>
                <p className="modal-desc">您可以在此更新、儲存您的常用病歷範本。</p>
                <textarea className="modal-textarea" value={templateContent} onChange={(e) => setTemplateContent(e.target.value)} rows={15}/>
                <div className="modal-actions">
                    <div className="modal-message">{message}</div>
                    <button className="modal-save" onClick={handleSave}>儲存更新</button>
                    <button className="modal-cancel" onClick={onClose}>關閉</button>
                </div>
            </div>
        </div>
    );
};

// 新增一個 ConfirmationModal 元件，取代 window.confirm
interface ConfirmationModalProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="custom-modal-bg" onClick={onCancel}>
      <div className="custom-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">確認</div>
        <p className="modal-desc">{message}</p>
        <div className="modal-actions">
          <button className="modal-save" onClick={onConfirm}>確認</button>
          <button className="modal-cancel" onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
};


// 修正：將 Audio Visualizer 邏輯內置到 SoapToolbar 中
// Toolbar 元件
interface SoapToolbarProps {
  onUploadAudio: () => void;
  onVoiceInput: () => void;
  onRecord: () => void;
  listening: boolean;
  isRecording: boolean;
  onCustom: (type: 'subjective' | 'objective') => void; 
  uploadStatus: 'idle' | 'uploading';
  // 移除 showAudioVisualizer 和 audioVisualizerRef 屬性，因為 Audio Visualizer 將是 Toolbar 內部的
  stream: MediaStream | null; // 將當前麥克風音訊流傳遞給 Toolbar
}

const SoapToolbar: React.FC<SoapToolbarProps> = ({
  onUploadAudio, onVoiceInput, onRecord,
  listening, isRecording, onCustom, uploadStatus,
  stream // 從父元件接收音訊流
}) => {
    // Audio Visualizer 相關的 Ref 和狀態現在內置在 Toolbar 中
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const audioVisualizerRef = useRef<HTMLCanvasElement>(null); 
    const animationFrameIdRef = useRef<number | null>(null); 

    const drawAudioVisualizer = useCallback(() => {
        // 檢查所有 Ref 是否已初始化
        if (!analyserRef.current || !dataArrayRef.current || !audioVisualizerRef.current) {
            return;
        }

        const canvas = audioVisualizerRef.current;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) {
            return;
        }

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height); // 每次繪製前清空畫布
        canvasCtx.fillStyle = '#f0f0f0'; // 背景顏色
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

        const barWidth = (canvas.width / dataArrayRef.current.length) * 2.5; // 調整條形寬度
        let x = 0;

        for (let i = 0; i < dataArrayRef.current.length; i++) {
            const barHeight = dataArrayRef.current[i]; 
            
            canvasCtx.fillStyle = 'rgb(0, 150, 255)'; // 藍色波形
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2); // 繪製從底部往上

            x += barWidth + 1; // 間隔
        }
    }, []); 

    // 管理 requestAnimationFrame 的生命週期
    useEffect(() => {
        const animate = () => {
            drawAudioVisualizer(); 
            animationFrameIdRef.current = requestAnimationFrame(animate); 
        };

        // 僅當 isRecording 為 true 且 stream 存在時才啟動波形
        if (isRecording && stream) {
            console.log("[AudioVisualizer Debug] Starting animation loop for Toolbar."); 
            // 確保 AudioContext 已啟動，否則波形不會動
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }

            // 僅當 analyserRef.current 未連接或需要重新連接時
            if (!analyserRef.current) {
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 256; 
                dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
                
                // 創建 MediaStreamSource 並連接到 AnalyserNode
                const source = audioContextRef.current.createMediaStreamSource(stream);
                source.connect(analyserRef.current);
            }
            
            animationFrameIdRef.current = requestAnimationFrame(animate); 
        } else {
            console.log("[AudioVisualizer Debug] Stopping animation loop for Toolbar."); 
            if (animationFrameIdRef.current) { 
                cancelAnimationFrame(animationFrameIdRef.current); 
                animationFrameIdRef.current = null; 
            }
            // 停止錄音時清空 Canvas
            if (audioVisualizerRef.current) { 
                const canvasCtx = audioVisualizerRef.current.getContext('2d');
                if (canvasCtx) {
                    canvasCtx.clearRect(0, 0, audioVisualizerRef.current.width, audioVisualizerRef.current.height);
                    canvasCtx.fillStyle = '#f0f0f0'; // 恢復背景色
                    canvasCtx.fillRect(0, 0, audioVisualizerRef.current.width, audioVisualizerRef.current.height);
                }
            }
            // 停止後關閉 AudioContext 釋放資源
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().then(() => {
                    console.log("[AudioVisualizer Debug] AudioContext closed in Toolbar.");
                    audioContextRef.current = null;
                    analyserRef.current = null;
                    dataArrayRef.current = null;
                }).catch(e => console.error("Error closing AudioContext in Toolbar:", e));
            }
        }

        return () => {
            console.log("[AudioVisualizer Debug] Cleanup: Cancelling animation frame in Toolbar."); 
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            // 卸載時也關閉 AudioContext
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().then(() => {
                    console.log("[AudioVisualizer Debug] AudioContext closed on unmount in Toolbar.");
                    audioContextRef.current = null;
                    analyserRef.current = null;
                    dataArrayRef.current = null;
                }).catch(e => console.error("Error closing AudioContext on unmount in Toolbar:", e));
            }
        };
    }, [isRecording, stream, drawAudioVisualizer]); // 依賴 isRecording 和 stream

    return (
        <div className="subob-toolbar-text">
            <button type="button" className="custom-btn" onClick={() => onCustom('subjective')}><FontAwesomeIcon icon={faStar} />自定義</button> 
            <div className="subob-toolbar-right">
                <button type="button" className="audio-btn" onClick={onUploadAudio} disabled={uploadStatus === 'uploading'}>
                    {uploadStatus === 'uploading' ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faFileAudio} />} 上傳
                </button>
                <button type="button" className={`speech-btn ${listening ? 'listening' : ''}`} onClick={onVoiceInput} disabled={isRecording}>
                    {listening ? <FontAwesomeIcon icon={faPause} /> : <FontAwesomeIcon icon={faMicrophone} />} 語音
                </button>
                <button type="button" className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={onRecord} disabled={listening}>
                    {isRecording ? <FontAwesomeIcon icon={faPause} /> : <FontAwesomeIcon icon={faCircleDot} />} 錄音
                </button>
                {/* Canvas 元素現在獨立地存在於每個 SoapToolbar 實例中 */}
                <canvas ref={audioVisualizerRef} width="100" height="30" 
                    style={{ 
                        border: '1px solid #ccc', 
                        borderRadius: '5px', 
                        marginLeft: '10px', 
                        verticalAlign: 'middle', 
                        display: (isRecording && stream) ? 'inline-block' : 'none' // 只有在錄音且有音訊流時才顯示
                    }}>
                </canvas>
            </div>
        </div>
    );
};


// 語音狀態通知
const SpeechStatusNotification: React.FC<{ message: string }> = ({ message }) => {
    if (!message) return null;
    return <div className="speech-notification">{message}</div>;
};


const SubObSection: React.FC<SubObSectionProps> = ({ subjective = '', objective = '', onChange, onGenerateSOAP }) => {
  const [generateState, setGenerateState] = useState<{ type: 'FillTemplate' | 'SOAP'; status: 'idle' | 'loading' | 'error'; error?: string }>({ type: 'SOAP', status: 'idle' });
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false); // 修正變數名稱以避免混淆
  const [editingTemplateType, setEditingTemplateType] = useState<'subjective' | 'objective'>('subjective');
  const [uploadState, setUploadState] = useState<{ status: 'idle' | 'uploading'; field: 'subjective' | 'objective' | null, error?: string }>({ status: 'idle', field: null });
  const activeFieldRef = useRef<'subjective' | 'objective' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // 用於清空內容的確認彈窗狀態
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalMessage, setConfirmModalMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);


  // --- 狀態定義 (放在頂部，優先初始化) ---
  const [currentSpeechText, setCurrentSpeechText] = useState(''); 
  const currentBaseTextRef = useRef<string>(''); // Used to store the text before current speech segment
  const textareaRefS = useRef<HTMLTextAreaElement>(null); 
  const textareaRefO = useRef<HTMLTextAreaElement>(null); 
  const cursorPositionRef = useRef<{start: number, end: number} | null>(null);

  const [isRecording, setIsRecording] = useState(false); 
  const [isTranscribing, setIsTranscribing] = useState(false); 
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null); // 麥克風音訊流的 Ref

  // NEW: Internal state for textarea content, allowing immediate updates for speech
  // 確保初始化時將 undefined 轉換為空字串 (加強防禦性)
  const [localSubjective, setLocalSubjective] = useState(subjective ?? ''); 
  const [localObjective, setLocalObjective] = useState(objective ?? ''); 

  // handleFinalTranscript (先於 useSpeechToText 的呼叫，但不會依賴 useSpeechToText 的返回值)
  const handleFinalTranscript = useCallback((transcript: string) => {
    if (activeFieldRef.current) {
      const key = activeFieldRef.current;
      // 使用 local state 作為最終內容計算的基準，並確保是字串
      const currentLocalContent = (key === 'subjective' ? localSubjective : localObjective) || '';
      let finalContent = currentLocalContent;
      const trimmedTranscript = (transcript || '').trim(); // 確保 transcript 是字串並進行 trim

      const cursor = cursorPositionRef.current;
      
      // 修正點：確保 prefix 和 suffix 在 if/else 之外定義，避免 ReferenceError
      let prefix = finalContent;
      let suffix = '';

      if (cursor && cursor.start !== undefined && cursor.end !== undefined) {
          const actualStart = Math.min(cursor.start, finalContent.length);
          const actualEnd = Math.min(cursor.end, finalContent.length);
          const safeStart = Math.min(actualStart, actualEnd);
          const safeEnd = Math.max(actualStart, actualEnd);

          prefix = finalContent.substring(0, safeStart);
          suffix = finalContent.substring(safeEnd);
          finalContent = prefix + trimmedTranscript + suffix; 
          
          setTimeout(() => {
              const targetTextarea = key === 'subjective' ? textareaRefS.current : textareaRefO.current;
              if (targetTextarea) {
                  targetTextarea.focus(); 
                  targetTextarea.setSelectionRange(prefix.length + trimmedTranscript.length, prefix.length + trimmedTranscript.length);
              }
          }, 0);
      } else { 
          // 修正點：如果沒有游標，直接追加到末尾，並處理換行
          finalContent = finalContent + (finalContent && trimmedTranscript ? '\n' : '') + trimmedTranscript;
          setTimeout(() => {
            const targetTextarea = key === 'subjective' ? textareaRefS.current : textareaRefO.current;
            if (targetTextarea) {
                targetTextarea.focus();
                targetTextarea.setSelectionRange(finalContent.length, finalContent.length);
            }
          }, 0);
      }
      
      // 直接更新 local state
      if (key === 'subjective') {
        setLocalSubjective(finalContent);
        onChange({ subjective: finalContent, objective: localObjective }); // 同步通知父組件
      } else {
        setLocalObjective(finalContent);
        onChange({ subjective: localSubjective, objective: finalContent }); // 同步通知父組件
      }

      setCurrentSpeechText(''); 
      cursorPositionRef.current = null; 
    }
  }, [onChange, localSubjective, localObjective]); // 依賴於 local state

  // handleInterimTranscript (先於 useSpeechToText 的呼叫)
  const handleInterimTranscript = useCallback((interimTranscript: string) => {
    setCurrentSpeechText(interimTranscript); 
  }, []);

  // --- useSpeechToText Hook 呼叫 ---
  // 將此 Hook 放在其他依賴它的函式之前
  const { isListening, statusMessage, startListening, stopListening, setStatusMessage } = useSpeechToText({
    onTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript,
    lang: 'zh-TW'
  });
  // --- useSpeechToText Hook 呼叫結束 ---

  // 定義 openTemplateModal 函數 (現在可以安全地使用 setStatusMessage)
  const openTemplateModal = useCallback((type: 'subjective' | 'objective') => {
    setIsTemplateModalOpen(true); 
    setEditingTemplateType(type);
  }, []);

  // 新增這個函數來處理範本儲存成功的邏輯 (現在不會自動更新輸入框)
  const handleTemplateSaveSuccess = useCallback((type: 'subjective' | 'objective', content: string) => {
      // 移除自動更新 local state 和 onChange 的邏輯，只顯示訊息並關閉模態框
      setIsTemplateModalOpen(false); // 儲存成功後關閉彈窗
      setStatusMessage(`${type === 'subjective' ? 'S' : 'O'} 自定義範本更新成功！`);
      setTimeout(() => setStatusMessage(''), 3000);
  }, [setStatusMessage]); // 僅依賴 setStatusMessage


  // handleInputChange (現在可以安全地使用 localSubjective 和 localObjective)
  const handleInputChange = useCallback((key: 'subjective' | 'objective', value: string) => {
    if (key === 'subjective') {
      // 確保 value 始終為字串
      setLocalSubjective(value || ''); 
      onChange({ subjective: value || '', objective: localObjective });
    } else {
      // 確保 value 始終為字串
      setLocalObjective(value || ''); 
      onChange({ subjective: localSubjective, objective: value || '' });
    }
  }, [onChange, localSubjective, localObjective]);
  
  

  // Centralized function to clean up audio resources - This will ONLY run on component mount/unmount now
  const cleanupAudioResources = useCallback(() => {
    console.log("Cleaning up audio resources...");
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach(track => track.stop());
      currentStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
            mediaRecorderRef.current.stop(); // Ensure recorder is stopped
        } catch (e) {
            console.warn("MediaRecorder was already stopped or in an invalid state during cleanup:", e);
        }
    }
  }, []); 

  // **NEW:** Separate useEffect for component mount/unmount cleanup only
  useEffect(() => {
    return () => {
      // Cleanup all resources when component unmounts
      cleanupAudioResources();
    };
  }, [cleanupAudioResources]); 

  // Sync internal state with props, but only when not actively listening/recording
  useEffect(() => {
    // 確保 props 轉換為字串再比較，避免 undefined vs '' 的問題
    const propSubjective = subjective ?? '';
    const propObjective = objective ?? '';

    if (!isListening && !isRecording) {
      if (localSubjective !== propSubjective) {
        setLocalSubjective(propSubjective);
      }
      if (localObjective !== propObjective) {
        setLocalObjective(propObjective);
      }
    }
  }, [subjective, objective, isListening, isRecording, localSubjective, localObjective]);

  // stopRecordingHandler (定義在 useSpeechToText 之後)
  const stopRecordingHandler = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setStatusMessage('錄音結束，正在處理...');
      // 清理 MediaStream (此處已足夠，AudioContext 關閉由 Toolbar 內部處理)
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(track => track.stop());
        currentStreamRef.current = null;
      }
    }
  }, [setStatusMessage]);

  // startRecordingHandler (定義在 useSpeechToText 之後，因為它依賴 isListening, stopListening, handleFinalTranscript)
  const startRecordingHandler = useCallback(async (field: 'subjective' | 'objective') => {
    // 如果正在語音辨識中，先停止並處理當前結果
    if (isListening) { 
      stopListening();
      if (currentSpeechText) {
          handleFinalTranscript(currentSpeechText);
      }
    }

    activeFieldRef.current = field;
    const textarea = field === 'subjective' ? textareaRefS.current : textareaRefO.current;
    
    if (textarea) {
        cursorPositionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
        currentBaseTextRef.current = textarea.value; 
    } else {
        cursorPositionRef.current = null;
        currentBaseTextRef.current = field === 'subjective' ? localSubjective : localObjective; 
    }
    setCurrentSpeechText(''); 

    try {
      // 確保在開始新的錄音前，清理所有之前的 MediaStream 資源
      if (currentStreamRef.current) {
          console.log("Existing audio stream found, cleaning up before new recording session.");
          currentStreamRef.current.getTracks().forEach(track => track.stop());
          currentStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentStreamRef.current = stream; // 保存音訊流，傳遞給 Toolbar
      
      // 檢查支援的 MIME 類型，確保錄音器有合適的編碼
      let mimeType = 'audio/webm'; // Default fallback
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg'; 
      }
      console.log(`MediaRecorder will use mimeType: ${mimeType}`);

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: mimeType });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) { // 只推入有數據的 chunk
            audioChunksRef.current.push(event.data);
        } else {
            console.log("ondataavailable received 0-byte data.");
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        // 使用錄音器實際使用的 mimeType 來創建 Blob
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' }); 
        const audioFile = new File([audioBlob], `recorded_audio_${Date.now()}.webm`, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });

        setIsRecording(false); 
        setIsTranscribing(true); 
        setStatusMessage('辨識中...'); 

        try {
          // 只有當 Blob 有數據時才發送請求
          if (audioBlob.size > 0) {
            const transcribedText = await transcribeAudio(audioFile);
            console.log("語音辨識結果:", transcribedText);
            
            let finalNewText = currentBaseTextRef.current; 
            const trimmedTranscribedText = (transcribedText || '').trim(); // 確保 transcribedText 是字串

            const cursor = cursorPositionRef.current;
            if (cursor && cursor.start !== undefined && cursor.end !== undefined) {
                const prefix = finalNewText.substring(0, cursor.start);
                const suffix = finalNewText.substring(cursor.end);
                // 修正點: 使用 trimmedTranscribedText
                finalNewText = prefix + trimmedTranscribedText + suffix;
                setTimeout(() => {
                    const targetTextarea = field === 'subjective' ? textareaRefS.current : textareaRefO.current;
                    if (targetTextarea) {
                        targetTextarea.focus(); 
                        targetTextarea.setSelectionRange(prefix.length + trimmedTranscribedText.length, prefix.length + trimmedTranscribedText.length);
                    }
                }, 0);
            } else {
                // 修正點: 如果沒有游標，追加到末尾，並處理換行
                finalNewText = finalNewText + (finalNewText && trimmedTranscribedText ? '\n' : '') + trimmedTranscribedText;
                setTimeout(() => {
                  const targetTextarea = field === 'subjective' ? textareaRefS.current : textareaRefO.current;
                  if (targetTextarea) {
                      targetTextarea.focus();
                      targetTextarea.setSelectionRange(finalNewText.length, finalNewText.length);
                  }
                }, 0);
            }
            handleInputChange(field, finalNewText); 
            setStatusMessage('辨識完成！');

          } else {
            setStatusMessage('錄音完成，但未捕獲到任何音訊數據。請嘗試說話。');
            console.warn("Recorded audio blob is empty (0 bytes).");
          }
          setTimeout(() => setStatusMessage(''), 3000);

        } catch (error: any) {
          console.error("語音辨識失敗:", error);
          setStatusMessage(`辨識失敗: ${error.message}`);
          setTimeout(() => setStatusMessage(''), 5000);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true); 
      setStatusMessage('錄音中...');
      
    } catch (error: any) {
      console.error("無法啟動錄音:", error);
      let errorMessage = "無法啟動錄音，請檢查麥克風權限或瀏覽器支援。";
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          errorMessage = "找不到麥克風設備。請確認已連接麥克風。";
      } else if (error.name === "NotAllowedError" || error.name === "SecurityError") {
          errorMessage = "麥克風權限被拒絕。請允許瀏覽器使用麥克風。";
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          errorMessage = "麥克風無法使用。可能正在被其他應用程式使用。";
      }
      setStatusMessage(errorMessage);
      setTimeout(() => setStatusMessage(''), 5000);
      setIsRecording(false);
      setIsTranscribing(false);
      cleanupAudioResources(); 
    }
  }, [isListening, stopListening, handleFinalTranscript, handleInputChange, setStatusMessage, currentSpeechText, localSubjective, localObjective, cleanupAudioResources]); 

  // handleRecordButtonClick (定義在 startRecordingHandler 之後)
  const handleRecordButtonClick = useCallback((field: 'subjective' | 'objective') => {
    if (isRecording && activeFieldRef.current === field) {
      stopRecordingHandler();
    } else {
      startRecordingHandler(field);
    }
  }, [isRecording, startRecordingHandler, stopRecordingHandler]);


  // toggleListening (定義在 useSpeechToText 之後，因為它依賴 isListening, stopListening, handleFinalTranscript, startListening)
  const toggleListening = useCallback((key: 'subjective' | 'objective') => {
    const textarea = key === 'subjective' ? textareaRefS.current : textareaRefO.current;
    
    // 如果正在錄音，則先停止錄音
    if (isRecording) { 
      stopRecordingHandler();
      return; 
    }

    // 處理當前即時語音文本 (如果存在且正在聆聽)，確保其最終確認
    if (isListening && currentSpeechText) { 
        handleFinalTranscript(currentSpeechText);
    }

    // 設定活動欄位，並捕獲游標位置和基準文本
    activeFieldRef.current = key;
    if (textarea) {
        cursorPositionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd }; 
        currentBaseTextRef.current = textarea.value; 
    } else {
        cursorPositionRef.current = null;
        currentBaseTextRef.current = key === 'subjective' ? localSubjective : localObjective; 
    }
    setCurrentSpeechText(''); // 清空即時語音文本

    // 根據 `isListening` 狀態和當前活動欄位來決定啟動或停止語音辨識
    const isCurrentlyListeningForThisField = isListening && activeFieldRef.current === key;
    if (isCurrentlyListeningForThisField) {
      stopListening(); 
    } else {
      // 如果已經在聆聽其他欄位，則先停止舊會話
      if(isListening) { 
        stopListening();
      }
      startListening(); 
    }
  }, [isRecording, stopRecordingHandler, isListening, stopListening, handleFinalTranscript, currentSpeechText, localSubjective, localObjective, startListening]);


  // 處理上傳文字檔的回調 (暫時保留，如果不需要可以移除)
  const handleTxtUpload = (key: 'subjective' | 'objective', file: File) => {
    console.log('Uploading text file...', file, key);
    // 這裡可以實作讀取文字檔的邏輯，將其內容添加到文本框
  };

  // 處理上傳音訊檔的回調 (暫時保留，如果不需要可以移除)
  const handleAudioUpload = async (file: File, key: 'subjective' | 'objective') => {
    setUploadState({ status: 'uploading', field: key, error: undefined });
    try {
      const transcribedText = await transcribeAudio(file);
      // 修正點: 在 trim 之前確保 transcribedText 是字串
      const trimmedTranscribedText = (transcribedText || '').trim();
      if (!trimmedTranscribedText) {
          setStatusMessage('語音辨識成功，但未偵測到任何文字。');
          setTimeout(() => setStatusMessage(''), 3000);
          setUploadState({ status: 'idle', field: null });
          return;
      }
      const currentText = key === 'subjective' ? localSubjective : localObjective; 
      // 修正點: 使用 trimmedTranscribedText
      handleInputChange(key, (currentText ? currentText + '\n' : '') + trimmedTranscribedText); // 使用換行符來分隔追加的語音內容
      setUploadState({ status: 'idle', field: null });
    } catch (error) {
      setStatusMessage('語音辨識失敗');
      setTimeout(() => setStatusMessage(''), 3000);
      setUploadState({ status: 'idle', field: key, error: '語語音辨識失敗' });
      setTimeout(() => setUploadState({ status: 'idle', field: null, error: undefined }), 5000);
    }
  };

  // handleGenerate 函數 (定義在 local state 之後)
  const handleGenerate = useCallback(async (type: 'FillTemplate' | 'SOAP') => {
    setGenerateState({ type, status: 'loading' });
    try {
      const generatedContent = await generateText(
          type, 
          localSubjective || '',
          localObjective || ''
      );
      
      if (typeof generatedContent !== 'string') {
          console.error('API 回傳的 generatedContent 不是字串:', generatedContent);
          setGenerateState({ type, status: 'error', error: '生成失敗: API 回傳無效內容' });
          setTimeout(() => setGenerateState({ type, status: 'idle' }), 5000);
          return;
      }

      if (type === 'FillTemplate') {
        setLocalSubjective(generatedContent.trim()); 
        onChange({ subjective: generatedContent.trim(), objective: localObjective }); 
      } else { // type === 'SOAP'
        setLocalObjective(generatedContent.trim()); // <-- 新增這行：更新 Objective 文字框
        onChange({ subjective: localSubjective, objective: generatedContent.trim() }); // <-- 同步更新父元件的 objective 狀態
        onGenerateSOAP(generatedContent.trim()); // 繼續呼叫 onGenerateSOAP，如果它有其他用途
      }
      setGenerateState({ type, status: 'idle' });
    } catch (error: any) {
      console.error('生成失敗:', error);
      const errorMessage = error.message || '未知錯誤';
      setGenerateState({ type, status: 'error', error: `生成失敗: ${errorMessage}` });
      setTimeout(() => setGenerateState({ type, status: 'idle' }), 5000);
    }
  }, [localSubjective, localObjective, onGenerateSOAP, onChange]); // 將 onChange 添加到依賴中


  // 計算文本框的值：如果正在即時語音輸入，則顯示基準文本 + 即時文本；否則顯示原始文本
  const getSubjectiveValue = useMemo(() => {
    if (isListening && activeFieldRef.current === 'subjective') {
        const baseText = currentBaseTextRef.current || ''; // 確保是字串
        const cursor = cursorPositionRef.current;
        const currentSpeech = currentSpeechText || ''; // 確保 currentSpeechText 是字串

        if (cursor && cursor.start !== undefined && cursor.end !== undefined) { 
            const prefix = baseText.substring(0, cursor.start);
            const suffix = baseText.substring(cursor.end);
            return prefix + currentSpeech + suffix;
        }
        // 修正點：在沒有游標時，始終追加
        return baseText + (baseText && currentSpeech ? '\n' : '') + currentSpeech; 
    }
    return localSubjective; // 不在語音輸入狀態時，返回 local state 的值
  }, [isListening, activeFieldRef.current, currentSpeechText, localSubjective, cursorPositionRef.current, currentBaseTextRef.current]);

  const getObjectiveValue = useMemo(() => {
    if (isListening && activeFieldRef.current === 'objective') {
        const baseText = currentBaseTextRef.current || ''; // 確保是字串
        const cursor = cursorPositionRef.current;
        const currentSpeech = currentSpeechText || ''; // 確保 currentSpeechText 是字串

        if (cursor && cursor.start !== undefined && cursor.end !== undefined) {
            const prefix = baseText.substring(0, cursor.start);
            const suffix = baseText.substring(cursor.end);
            return prefix + currentSpeech + suffix;
        }
        // 修正點：在沒有游標時，始終追加
        return baseText + (baseText && currentSpeech ? '\n' : '') + currentSpeech;
    }
    return localObjective; // 不在語音輸入狀態時，返回 local state 的值
  }, [isListening, activeFieldRef.current, currentSpeechText, localObjective, cursorPositionRef.current, currentBaseTextRef.current]);


    // 處理清空按鈕的點擊事件
  const handleClearButtonClick = useCallback((field: 'subjective' | 'objective') => {
    setConfirmModalMessage(`確定要清空 ${field === 'subjective' ? 'Subjective' : 'Objective'} 內容嗎？`);
    setConfirmAction(() => () => handleInputChange(field, '')); // 設定確認後執行的動作
    setIsConfirmModalOpen(true); // 開啟確認彈窗
  }, [handleInputChange]);


  return (
    <div className="subob-section">
      <SpeechStatusNotification message={statusMessage} />
      {/* 使用修正後的 isTemplateModalOpen */}
      <CustomTemplateModal 
        isOpen={isTemplateModalOpen} 
        type={editingTemplateType} 
        onClose={() => setIsTemplateModalOpen(false)} 
        onSaveSuccess={handleTemplateSaveSuccess} // <-- 將新的回調函數傳入
      />
      {/* 新增的 ConfirmationModal */}
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        message={confirmModalMessage}
        onConfirm={() => {
          if (confirmAction) {
            confirmAction();
          }
          setIsConfirmModalOpen(false);
          setConfirmAction(null);
        }}
        onCancel={() => {
          setIsConfirmModalOpen(false);
          setConfirmAction(null);
        }}
      />

      <input type="file" accept=".txt" ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0] && activeFieldRef.current) handleTxtUpload(activeFieldRef.current, e.target.files[0]); e.target.value = ''; }}/>
      <input type="file" accept="audio/*" ref={audioInputRef} style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0] && activeFieldRef.current) handleAudioUpload(e.target.files[0], activeFieldRef.current); e.target.value = ''; }}/>

      <div className="subob-card subjective">
        <div className="subob-header"><span className="subob-title">Subjective</span><span className="subob-section-sub">主觀敘述</span></div>
        <div className="subob-toolbar-row">
          <SoapToolbar
            onUploadAudio={() => { activeFieldRef.current = 'subjective'; audioInputRef.current?.click(); }}
            onVoiceInput={() => toggleListening('subjective')}
            listening={isListening && activeFieldRef.current === 'subjective'}
            onRecord={() => handleRecordButtonClick('subjective')}
            isRecording={isRecording && activeFieldRef.current === 'subjective'}
            onCustom={openTemplateModal} 
            uploadStatus={uploadState.field === 'subjective' ? uploadState.status : 'idle'}
            // 修正點：將 currentStreamRef.current 傳遞給 SoapToolbar
            stream={activeFieldRef.current === 'subjective' ? currentStreamRef.current : null} 
          />
        </div>
        {uploadState.error && uploadState.field === 'subjective' && <div className="subob-error-message">{uploadState.error}</div>}
        <textarea
          className="subob-textarea"
          value={getSubjectiveValue} // 使用計算過的值
          onChange={e => handleInputChange('subjective', e.target.value)}
          rows={6}
          placeholder="點擊「語音」按鈕開始即時辨識..."
          ref={textareaRefS} // 綁定 ref
        />
        <div className="infer-btn-row">
            {generateState.status === 'error' && generateState.type === 'FillTemplate' && <span className="error-message">{generateState.error}</span>}
            {/* 修正點：使用 handleClearButtonClick 替換 window.confirm */}
            <button type="button" className="clear-btn" onClick={() => handleClearButtonClick('subjective')}>清空</button>
            <button type="button" className="infer-btn-s" onClick={() => handleGenerate('FillTemplate')} disabled={generateState.status === 'loading'}>
                {generateState.status === 'loading' && generateState.type === 'FillTemplate' ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faRobot} />} 生成
            </button>
        </div>
      </div>

      <div className="subob-card objective">
        <div className="subob-header"><span className="subob-title">Objective</span><span className="subob-section-sub">客觀檢查</span></div>
        <div className="subob-toolbar-row">
          <SoapToolbar
            onUploadAudio={() => { activeFieldRef.current = 'objective'; audioInputRef.current?.click(); }}
            onVoiceInput={() => toggleListening('objective')}
            listening={isListening && activeFieldRef.current === 'objective'}
            onRecord={() => handleRecordButtonClick('objective')}
            isRecording={isRecording && activeFieldRef.current === 'objective'}
            onCustom={() => openTemplateModal('objective')} 
            uploadStatus={uploadState.field === 'objective' ? uploadState.status : 'idle'}
            // 修正點：將 currentStreamRef.current 傳遞給 SoapToolbar
            stream={activeFieldRef.current === 'objective' ? currentStreamRef.current : null} 
          />
        </div>
        {uploadState.error && uploadState.field === 'objective' && <div className="subob-error-message">{uploadState.error}</div>}
        <textarea
          className="subob-textarea"
          value={getObjectiveValue} // 使用計算過的值
          onChange={e => handleInputChange('objective', e.target.value)}
          rows={6}
          placeholder="可由此處手動修正或輸入內容..."
          ref={textareaRefO} // 綁定 ref
        />
        <div className="infer-btn-row">
            {generateState.status === 'error' && generateState.type === 'SOAP' && <span className="error-message">{generateState.error}</span>}
            {/* 修正點：使用 handleClearButtonClick 替換 window.confirm */}
            <button type="button" className="clear-btn" onClick={() => handleClearButtonClick('objective')}>清空</button>
            <button type="button" className="infer-btn" onClick={() => handleGenerate('SOAP')} disabled={generateState.status === 'loading'}>
              {generateState.status === 'loading' && generateState.type === 'SOAP' ? <FontAwesomeIcon icon={faSpinner} spin /> : <><FontAwesomeIcon icon={faRobot} /> 生成</>}
            </button>
        </div>
      </div>
    </div>
  );
};

export default SubObSection;

