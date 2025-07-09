// src/components/SubObSection.tsx

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import '../styles/SubObSection.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// 確保導入所有需要的圖標
import { faMicrophone, faFileAudio, faStar, faRobot, faSpinner, faFileLines, faPause, faCircleDot, faListCheck } from '@fortawesome/free-solid-svg-icons';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { getCustomTemplate, saveCustomTemplate } from '../services/templateService';
import { generateText, transcribeAudio } from '../services/chatService';

// Props 介面
interface SubObSectionProps {
  subjective?: string;
  objective?: string;
  onChange: (fields: { subjective: string; objective:string }) => void;
  onGenerateSOAP: (generatedText: string) => void;
  onSelectObjectiveDetails?: () => void; // 新增：用於觸發選擇 Objective 細項
}

// CustomTemplateModal 元件 Props 介面
interface CustomTemplateModalProps {
  isOpen: boolean;
  type: 'subjective' | 'objective';
  onClose: () => void;
  onSaveSuccess: (type: 'subjective' | 'objective', content: string) => void; 
}

// CustomTemplateModal 元件 (保持不變)
const CustomTemplateModal: React.FC<CustomTemplateModalProps> = ({ isOpen, type, onClose, onSaveSuccess }) => {
    const [templateContent, setTemplateContent] = useState('');
    const [message, setMessage] = useState('');
    
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

    const handleSave = async () => { 
        try { 
            setMessage('儲存中...'); 
            await saveCustomTemplate(type, templateContent); 
            setMessage('儲存成功！'); 
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

// ConfirmationModal 元件 (保持不變)
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


// Toolbar 元件
interface SoapToolbarProps {
  onUploadAudio?: () => void; // 將其設為可選
  onVoiceInput: () => void;
  onRecord: () => void;
  listening: boolean;
  isRecording: boolean;
  onCustom: (type: 'subjective' | 'objective') => void; 
  uploadStatus: 'idle' | 'uploading';
  stream: MediaStream | null;
  onSelectObjectiveDetailsClick?: () => void; // 新增：Objective 細項選擇的點擊事件
}

const SoapToolbar: React.FC<SoapToolbarProps> = ({
  onUploadAudio, onVoiceInput, onRecord,
  listening, isRecording, onCustom, uploadStatus,
  stream,
  onSelectObjectiveDetailsClick // 接收新的 prop
}) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);
    const audioVisualizerRef = useRef<HTMLCanvasElement>(null); 
    const animationFrameIdRef = useRef<number | null>(null); 

    const drawAudioVisualizer = useCallback(() => {
        if (!analyserRef.current || !dataArrayRef.current || !audioVisualizerRef.current) {
            return;
        }

        const canvas = audioVisualizerRef.current;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) {
            return;
        }

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height); 
        canvasCtx.fillStyle = '#f0f0f0'; 
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

        const barWidth = (canvas.width / dataArrayRef.current.length) * 2.5; 
        let x = 0;

        for (let i = 0; i < dataArrayRef.current.length; i++) {
            const barHeight = dataArrayRef.current[i]; 
            
            canvasCtx.fillStyle = 'rgb(0, 150, 255)'; 
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2); 

            x += barWidth + 1; 
        }
    }, []); 

    useEffect(() => {
        const animate = () => {
            drawAudioVisualizer(); 
            animationFrameIdRef.current = requestAnimationFrame(animate); 
        };

        if (isRecording && stream) {
            console.log("[AudioVisualizer Debug] Starting animation loop for Toolbar."); 
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }

            if (!analyserRef.current) {
                analyserRef.current = audioContextRef.current.createAnalyser();
                analyserRef.current.fftSize = 256; 
                dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
                
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
            if (audioVisualizerRef.current) { 
                const canvasCtx = audioVisualizerRef.current.getContext('2d');
                if (canvasCtx) {
                    canvasCtx.clearRect(0, 0, audioVisualizerRef.current.width, audioVisualizerRef.current.height);
                    canvasCtx.fillStyle = '#f0f0f0'; 
                    canvasCtx.fillRect(0, 0, audioVisualizerRef.current.width, audioVisualizerRef.current.height);
                }
            }
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
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().then(() => {
                    console.log("[AudioVisualizer Debug] AudioContext closed on unmount in Toolbar.");
                    audioContextRef.current = null;
                    analyserRef.current = null;
                    dataArrayRef.current = null;
                }).catch(e => console.error("Error closing AudioContext on unmount in Toolbar:", e));
            }
        };
    }, [isRecording, stream, drawAudioVisualizer]); 

    return (
        <div className="subob-toolbar-text">
            <button type="button" className="custom-btn" onClick={() => onCustom('subjective')}><FontAwesomeIcon icon={faStar} />自定義</button> 
            <div className="subob-toolbar-right">
                {/* 根據 onSelectObjectiveDetailsClick 是否存在來渲染不同的按鈕 */}
                {onSelectObjectiveDetailsClick ? (
                    <button type="button" className="audio-btn" onClick={onSelectObjectiveDetailsClick}>
                        <FontAwesomeIcon icon={faListCheck} /> 選擇細項
                    </button>
                ) : (
                    <button type="button" className="audio-btn" onClick={onUploadAudio} disabled={uploadStatus === 'uploading'}>
                        {uploadStatus === 'uploading' ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faFileAudio} />} 上傳
                    </button>
                )}
                
                <button type="button" className={`speech-btn ${listening ? 'listening' : ''}`} onClick={onVoiceInput} disabled={isRecording}>
                    {listening ? <FontAwesomeIcon icon={faPause} /> : <FontAwesomeIcon icon={faMicrophone} />} 語音
                </button>
                <button type="button" className={`record-btn ${isRecording ? 'recording' : ''}`} onClick={onRecord} disabled={listening}>
                    {isRecording ? <FontAwesomeIcon icon={faPause} /> : <FontAwesomeIcon icon={faCircleDot} />} 錄音
                </button>
                <canvas ref={audioVisualizerRef} width="100" height="30" 
                    style={{ 
                        border: '1px solid #ccc', 
                        borderRadius: '5px', 
                        marginLeft: '10px', 
                        verticalAlign: 'middle', 
                        display: (isRecording && stream) ? 'inline-block' : 'none' 
                    }}>
                </canvas>
            </div>
        </div>
    );
};


// SpeechStatusNotification 元件 (保持不變)
const SpeechStatusNotification: React.FC<{ message: string }> = ({ message }) => {
    if (!message) return null;
    return <div className="speech-notification">{message}</div>;
};


const SubObSection: React.FC<SubObSectionProps> = ({ subjective = '', objective = '', onChange, onGenerateSOAP, onSelectObjectiveDetails }) => {
  // === 除錯輸出：SubObSection 接收到的 props ===
  console.log('SubObSection: 接收到的 Subjective prop:', subjective);
  console.log('SubObSection: 接收到的 Objective prop:', objective);
  // ===========================================

  const [generateState, setGenerateState] = useState<{ type: 'FillTemplate' | 'SOAP'; status: 'idle' | 'loading' | 'error'; error?: string }>({ type: 'SOAP', status: 'idle' });
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false); 
  const [editingTemplateType, setEditingTemplateType] = useState<'subjective' | 'objective'>('subjective');
  const [uploadState, setUploadState] = useState<{ status: 'idle' | 'uploading'; field: 'subjective' | 'objective' | null, error?: string }>({ status: 'idle', field: null });
  const activeFieldRef = useRef<'subjective' | 'objective' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalMessage, setConfirmModalMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  const [currentSpeechText, setCurrentSpeechText] = useState(''); 
  const currentBaseTextRef = useRef<string>(''); 
  const textareaRefS = useRef<HTMLTextAreaElement>(null); 
  const textareaRefO = useRef<HTMLTextAreaElement>(null); 
  const cursorPositionRef = useRef<{start: number, end: number} | null>(null);

  const [isRecording, setIsRecording] = useState(false); 
  const [isTranscribing, setIsTranscribing] = useState(false); 
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentStreamRef = useRef<MediaStream | null>(null); 

  // === 關鍵修改：確保 localState 在 props 更新時重新初始化 ===
  const [localSubjective, setLocalSubjective] = useState(subjective ?? ''); 
  const [localObjective, setLocalObjective] = useState(objective ?? ''); 

  // 當 subjective prop 改變時，更新 localSubjective
  useEffect(() => {
    setLocalSubjective(subjective ?? '');
    console.log('SubObSection useEffect: Subjective prop updated, setting localSubjective to:', subjective);
  }, [subjective]);

  // 當 objective prop 改變時，更新 localObjective
  useEffect(() => {
    setLocalObjective(objective ?? '');
    console.log('SubObSection useEffect: Objective prop updated, setting localObjective to:', objective);
  }, [objective]);
  // =========================================================

  const handleFinalTranscript = useCallback((transcript: string) => {
    if (activeFieldRef.current) {
      const key = activeFieldRef.current;
      // 使用 localState 而不是 prop，確保操作的是當前編輯的值
      const currentLocalContent = (key === 'subjective' ? localSubjective : localObjective) || ''; 
      let finalContent = currentLocalContent;
      const trimmedTranscript = (transcript || '').trim();

      const cursor = cursorPositionRef.current;
      
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
          finalContent = finalContent + (finalContent && trimmedTranscript ? '\n' : '') + trimmedTranscript;
          setTimeout(() => {
            const targetTextarea = key === 'subjective' ? textareaRefS.current : textareaRefO.current;
            if (targetTextarea) {
                targetTextarea.focus();
                targetTextarea.setSelectionRange(finalContent.length, finalContent.length);
            }
          }, 0);
      }
      
      if (key === 'subjective') {
        setLocalSubjective(finalContent);
        onChange({ subjective: finalContent, objective: localObjective }); 
      } else {
        setLocalObjective(finalContent);
        onChange({ subjective: localSubjective, objective: finalContent }); 
      }

      setCurrentSpeechText(''); 
      cursorPositionRef.current = null; 
    }
  }, [onChange, localSubjective, localObjective]); 

  const handleInterimTranscript = useCallback((interimTranscript: string) => {
    setCurrentSpeechText(interimTranscript); 
  }, []);

  const { isListening, statusMessage, startListening, stopListening, setStatusMessage } = useSpeechToText({
    onTranscript: handleFinalTranscript,
    onInterimTranscript: handleInterimTranscript,
    lang: 'zh-TW'
  });

  const openTemplateModal = useCallback((type: 'subjective' | 'objective') => {
    setIsTemplateModalOpen(true); 
    setEditingTemplateType(type);
  }, []);

  const handleTemplateSaveSuccess = useCallback((type: 'subjective' | 'objective', content: string) => {
      setIsTemplateModalOpen(false); 
      setStatusMessage(`${type === 'subjective' ? 'S' : 'O'} 自定義範本更新成功！`);
      setTimeout(() => setStatusMessage(''), 3000);
  }, [setStatusMessage]); 


  const handleInputChange = useCallback((key: 'subjective' | 'objective', value: string) => {
    if (key === 'subjective') {
      setLocalSubjective(value || ''); 
      onChange({ subjective: value || '', objective: localObjective });
    } else {
      setLocalObjective(value || ''); 
      onChange({ subjective: localSubjective, objective: value || '' });
    }
  }, [onChange, localSubjective, localObjective]);
  
  
  const cleanupAudioResources = useCallback(() => {
    console.log("Cleaning up audio resources...");
    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach(track => track.stop());
      currentStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
            mediaRecorderRef.current.stop(); 
        } catch (e) {
            console.warn("MediaRecorder was already stopped or in an invalid state during cleanup:", e);
        }
    }
  }, []); 

  useEffect(() => {
    return () => {
      cleanupAudioResources();
    };
  }, [cleanupAudioResources]); 

  const stopRecordingHandler = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setStatusMessage('錄音結束，正在處理...');
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(track => track.stop());
        currentStreamRef.current = null;
      }
    }
  }, [setStatusMessage]);

  const startRecordingHandler = useCallback(async (field: 'subjective' | 'objective') => {
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
      if (currentStreamRef.current) {
          console.log("Existing audio stream found, cleaning up before new recording session.");
          currentStreamRef.current.getTracks().forEach(track => track.stop());
          currentStreamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentStreamRef.current = stream; 
      
      let mimeType = 'audio/webm'; 
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
        if (event.data.size > 0) { 
            audioChunksRef.current.push(event.data);
        } else {
            console.log("ondataavailable received 0-byte data.");
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' }); 
        const audioFile = new File([audioBlob], `recorded_audio_${Date.now()}.webm`, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });

        setIsRecording(false); 
        setIsTranscribing(true); 
        setStatusMessage('辨識中...'); 

        try {
          if (audioBlob.size > 0) {
            const transcribedText = await transcribeAudio(audioFile);
            console.log("語音辨識結果:", transcribedText);
            
            let finalNewText = currentBaseTextRef.current; 
            const trimmedTranscribedText = (transcribedText || '').trim(); 

            const cursor = cursorPositionRef.current;
            if (cursor && cursor.start !== undefined && cursor.end !== undefined) {
                const prefix = finalNewText.substring(0, cursor.start);
                const suffix = finalNewText.substring(cursor.end);
                finalNewText = prefix + trimmedTranscribedText + suffix;
                setTimeout(() => {
                    const targetTextarea = field === 'subjective' ? textareaRefS.current : textareaRefO.current;
                    if (targetTextarea) {
                        targetTextarea.focus(); 
                        targetTextarea.setSelectionRange(prefix.length + trimmedTranscribedText.length, prefix.length + trimmedTranscribedText.length);
                    }
                }, 0);
            } else {
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

  const handleRecordButtonClick = useCallback((field: 'subjective' | 'objective') => {
    if (isRecording && activeFieldRef.current === field) {
      stopRecordingHandler();
    } else {
      startRecordingHandler(field);
    }
  }, [isRecording, startRecordingHandler, stopRecordingHandler]);


  const toggleListening = useCallback((key: 'subjective' | 'objective') => {
    const textarea = key === 'subjective' ? textareaRefS.current : textareaRefO.current;
    
    if (isRecording) { 
      stopRecordingHandler();
      return; 
    }

    if (isListening && currentSpeechText) { 
        handleFinalTranscript(currentSpeechText);
    }

    activeFieldRef.current = key;
    if (textarea) {
        cursorPositionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd }; 
        currentBaseTextRef.current = textarea.value; 
    } else {
        cursorPositionRef.current = null;
        currentBaseTextRef.current = key === 'subjective' ? localSubjective : localObjective; 
    }
    setCurrentSpeechText(''); 

    const isCurrentlyListeningForThisField = isListening && activeFieldRef.current === key;
    if (isCurrentlyListeningForThisField) {
      stopListening(); 
    } else {
      if(isListening) { 
        stopListening();
      }
      startListening(); 
    }
  }, [isRecording, stopRecordingHandler, isListening, stopListening, handleFinalTranscript, currentSpeechText, localSubjective, localObjective, startListening]);


  const handleTxtUpload = (key: 'subjective' | 'objective', file: File) => {
    console.log('Uploading text file...', file, key);
  };

  const handleAudioUpload = async (file: File, key: 'subjective' | 'objective') => {
    setUploadState({ status: 'uploading', field: key, error: undefined });
    try {
      const transcribedText = await transcribeAudio(file);
      const trimmedTranscribedText = (transcribedText || '').trim();
      if (!trimmedTranscribedText) {
          setStatusMessage('語音辨識成功，但未偵測到任何文字。');
          setTimeout(() => setStatusMessage(''), 3000);
          setUploadState({ status: 'idle', field: null });
          return;
      }
      const currentText = key === 'subjective' ? localSubjective : localObjective; 
      handleInputChange(key, (currentText ? currentText + '\n' : '') + trimmedTranscribedText); 
      setUploadState({ status: 'idle', field: null });
    } catch (error) {
      setStatusMessage('語音辨識失敗');
      setTimeout(() => setStatusMessage(''), 3000);
      setUploadState({ status: 'idle', field: key, error: '語語音辨識失敗' });
      setTimeout(() => setUploadState({ status: 'idle', field: null, error: undefined }), 5000);
    }
  };

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
      } else { 
        setLocalObjective(generatedContent.trim()); 
        onChange({ subjective: localSubjective, objective: generatedContent.trim() }); 
        onGenerateSOAP(generatedContent.trim()); 
      }
      setGenerateState({ type, status: 'idle' });
    } catch (error: any) {
      console.error('生成失敗:', error);
      const errorMessage = error.message || '未知錯誤';
      setGenerateState({ type, status: 'error', error: `生成失敗: ${errorMessage}` });
      setTimeout(() => setGenerateState({ type, status: 'idle' }), 5000);
    }
  }, [localSubjective, localObjective, onGenerateSOAP, onChange]); 


  const getSubjectiveValue = useMemo(() => {
    // === 除錯輸出：getSubjectiveValue 計算前狀態 ===
    // console.log('getSubjectiveValue debug:', { isListening, activeFieldRef: activeFieldRef.current, currentSpeechText, localSubjective, cursorPosition: cursorPositionRef.current, currentBaseText: currentBaseTextRef.current });
    // ===============================================

    if (isListening && activeFieldRef.current === 'subjective') {
        const baseText = currentBaseTextRef.current || ''; 
        const cursor = cursorPositionRef.current;
        const currentSpeech = currentSpeechText || ''; 

        if (cursor && cursor.start !== undefined && cursor.end !== undefined) { 
            const prefix = baseText.substring(0, cursor.start);
            const suffix = baseText.substring(cursor.end);
            return prefix + currentSpeech + suffix;
        }
        return baseText + (baseText && currentSpeech ? '\n' : '') + currentSpeech; 
    }
    return localSubjective; 
  }, [isListening, activeFieldRef.current, currentSpeechText, localSubjective, cursorPositionRef.current, currentBaseTextRef.current]);

  const getObjectiveValue = useMemo(() => {
    // === 除錯輸出：getObjectiveValue 計算前狀態 ===
    // console.log('getObjectiveValue debug:', { isListening, activeFieldRef: activeFieldRef.current, currentSpeechText, localObjective, cursorPosition: cursorPositionRef.current, currentBaseText: currentBaseTextRef.current });
    // ===============================================

    if (isListening && activeFieldRef.current === 'objective') {
        const baseText = currentBaseTextRef.current || ''; 
        const cursor = cursorPositionRef.current;
        const currentSpeech = currentSpeechText || ''; 

        if (cursor && cursor.start !== undefined && cursor.end !== undefined) {
            const prefix = baseText.substring(0, cursor.start);
            const suffix = baseText.substring(cursor.end);
            return prefix + currentSpeech + suffix;
        }
        return baseText + (baseText && currentSpeech ? '\n' : '') + currentSpeech;
    }
    return localObjective; 
  }, [isListening, activeFieldRef.current, currentSpeechText, localObjective, cursorPositionRef.current, currentBaseTextRef.current]);


  const handleClearButtonClick = useCallback((field: 'subjective' | 'objective') => {
    setConfirmModalMessage(`確定要清空 ${field === 'subjective' ? 'Subjective' : 'Objective'} 內容嗎？`);
    setConfirmAction(() => () => handleInputChange(field, '')); 
    setIsConfirmModalOpen(true); 
  }, [handleInputChange]);


  return (
    <div className="subob-section">
      <SpeechStatusNotification message={statusMessage} />
      <CustomTemplateModal 
        isOpen={isTemplateModalOpen} 
        type={editingTemplateType} 
        onClose={() => setIsTemplateModalOpen(false)} 
        onSaveSuccess={handleTemplateSaveSuccess} 
      />
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
            onUploadAudio={() => { activeFieldRef.current = 'subjective'; audioInputRef.current?.click(); }} // Subjective 仍然使用上傳功能
            onVoiceInput={() => toggleListening('subjective')}
            listening={isListening && activeFieldRef.current === 'subjective'}
            onRecord={() => handleRecordButtonClick('subjective')}
            isRecording={isRecording && activeFieldRef.current === 'subjective'}
            onCustom={openTemplateModal} 
            uploadStatus={uploadState.field === 'subjective' ? uploadState.status : 'idle'}
            stream={activeFieldRef.current === 'subjective' ? currentStreamRef.current : null} 
            // 不傳遞 onSelectObjectiveDetailsClick 給 Subjective 的 Toolbar
          />
        </div>
        {uploadState.error && uploadState.field === 'subjective' && <div className="subob-error-message">{uploadState.error}</div>}
        <textarea
          className="subob-textarea"
          value={getSubjectiveValue} // 使用 useMemo 的值
          onChange={e => handleInputChange('subjective', e.target.value)}
          rows={6}
          placeholder="點擊「語音」按鈕開始即時辨識..."
          ref={textareaRefS} 
        />
        <div className="infer-btn-row">
            {generateState.status === 'error' && generateState.type === 'FillTemplate' && <span className="error-message">{generateState.error}</span>}
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
            // 移除 onUploadAudio，改為傳遞 onSelectObjectiveDetailsClick
            // onUploadAudio={() => { activeFieldRef.current = 'objective'; audioInputRef.current?.click(); }}
            onVoiceInput={() => toggleListening('objective')}
            listening={isListening && activeFieldRef.current === 'objective'}
            onRecord={() => handleRecordButtonClick('objective')}
            isRecording={isRecording && activeFieldRef.current === 'objective'}
            onCustom={() => openTemplateModal('objective')} 
            uploadStatus={uploadState.field === 'objective' ? uploadState.status : 'idle'}
            stream={activeFieldRef.current === 'objective' ? currentStreamRef.current : null} 
            onSelectObjectiveDetailsClick={onSelectObjectiveDetails} // <-- 傳遞 Objective 細項選擇的點擊事件
          />
        </div>
        {uploadState.error && uploadState.field === 'objective' && <div className="subob-error-message">{uploadState.error}</div>}
        <textarea
          className="subob-textarea"
          value={getObjectiveValue} // 使用 useMemo 的值
          onChange={e => handleInputChange('objective', e.target.value)}
          rows={6}
          placeholder="可由此處手動修正或輸入內容..."
          ref={textareaRefO} 
        />
        <div className="infer-btn-row">
            {generateState.status === 'error' && generateState.type === 'SOAP' && <span className="error-message">{generateState.error}</span>}
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
