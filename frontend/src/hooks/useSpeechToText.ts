import { useState, useRef, useEffect, useCallback } from 'react';

// 宣告 Web Speech API 的介面，以避免 TypeScript 編譯錯誤
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechToTextOptions {
  onTranscript: (transcript: string) => void;
  lang?: string;
  onInterimTranscript?: (interimTranscript: string) => void;
}

export const useSpeechToText = ({
  onTranscript,
  lang = 'zh-TW',
  onInterimTranscript
}: SpeechToTextOptions) => {
  const [isListening, setIsListening] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  // recognitionRef 將持有 SpeechRecognition 實例
  const recognitionRef = useRef<any>(null); 
  const currentInterimTranscriptRef = useRef(''); // 用於追蹤目前的即時文字稿

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusMessage("您的瀏覽器不支援語音辨識功能。");
      return () => {}; // 如果不支持，則什麼都不做
    }

    // 只創建一次 SpeechRecognition 實例
    const recognition = new SpeechRecognition();
    recognition.continuous = true; // 設定為 true，允許持續聆聽，解決停頓問題
    recognition.interimResults = true; // 獲取即時結果
    recognition.lang = lang; // 設定語言

    recognition.onstart = () => {
      setIsListening(true);
      setStatusMessage('正在聆聽...');
      currentInterimTranscriptRef.current = ''; // 每次開始時清空即時文字稿
      console.log('useSpeechToText: Recognition instance started.');
    };

    recognition.onend = () => {
      setIsListening(false);
      setStatusMessage(''); // 會話結束時清空狀態消息
      console.log('useSpeechToText: Recognition instance ended.');
      // 注意：在 continuous 模式下，onend 通常只在明確 stop() 或長時間無語音後觸發
    };

    recognition.onerror = (event: any) => {
      console.error('useSpeechToText: 語音辨識錯誤:', event.error);
      if (event.error === 'not-allowed') {
        setStatusMessage('語音辨識失敗：您需要允許瀏覽器使用麥克風的權限。');
      } else if (event.error === 'no-speech') {
        setStatusMessage('未偵測到語音，請再試一次。');
      } else if (event.error === 'aborted') {
        console.log('useSpeechToText: Recognition aborted by user (explicit stop).');
        setStatusMessage(''); // 被用戶停止時，清空狀態消息
      } else {
        setStatusMessage(`語音辨識錯誤: ${event.error}`);
      }
      setIsListening(false);
      currentInterimTranscriptRef.current = '';
      setTimeout(() => setStatusMessage(''), 5000);
      // 錯誤時如果辨識還在進行，則停止它
      if (recognitionRef.current && recognitionRef.current.recognizing) {
          recognitionRef.current.stop();
      }
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      // 遍歷所有結果，區分最終結果和即時結果
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // 處理最終文字稿
      if (finalTranscript) {
        console.log('useSpeechToText: Final transcript received:', finalTranscript);
        onTranscript(finalTranscript); // 傳遞最終結果給父組件
        currentInterimTranscriptRef.current = ''; // 清空即時文字稿，因為已經有最終結果
        // 在 finalTranscript 觸發後，仍然可能存在最後一個 interimTranscript，需要確保其傳遞
        if (onInterimTranscript && interimTranscript) { 
          onInterimTranscript(interimTranscript);
        } else if (onInterimTranscript) { // 如果沒有新的 interim 但有 final，也清空即時顯示
          onInterimTranscript('');
        }
      } else if (onInterimTranscript && interimTranscript) { // 只有即時結果時
        console.log('useSpeechToText: Interim transcript received:', interimTranscript);
        currentInterimTranscriptRef.current = interimTranscript;
        onInterimTranscript(interimTranscript); // 傳遞即時結果給父組件
      } else if (onInterimTranscript && !finalTranscript) { // 沒有任何文字時 (例如靜音)
        onInterimTranscript(''); // 清空即時顯示
      }
    };
    
    recognitionRef.current = recognition; // 將實例儲存到 ref 中

    // 組件卸載時清理
    return () => {
      if (recognitionRef.current) {
        console.log('useSpeechToText: Cleaning up recognition on unmount.');
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [lang, onTranscript, onInterimTranscript]); // 依賴項確保在語言或回調函數改變時重新配置

  const startListening = useCallback(() => {
    // 確保 recognition 實例存在且目前沒有在辨識中 (使用 .recognizing 屬性)
    if (recognitionRef.current) { 
      if (!recognitionRef.current.recognizing) {
          try {
            recognitionRef.current.start();
            console.log('useSpeechToText: Called recognition.start().');
          } catch (e: any) {
            console.error("useSpeechToText: 無法啟動語音辨識 (Caught error):", e);
            setStatusMessage("無法啟動語音辨識，請檢查瀏覽器權限或嘗試重新整理。");
            setTimeout(() => setStatusMessage(''), 5000);
          }
      } else {
          console.log('useSpeechToText: Recognition is already recognizing. Not calling start().');
      }
    } else {
        setStatusMessage("您的瀏覽器不支援語音辨識功能。");
    }
  }, [setStatusMessage]); 

  const stopListening = useCallback(() => {
    // 只有在 recognition 實例存在且正在辨識時才停止
    if (recognitionRef.current && recognitionRef.current.recognizing) { 
      console.log('useSpeechToText: Called recognition.stop() explicitly.');
      recognitionRef.current.stop();
    } else {
      console.log('useSpeechToText: Not recognizing, or recognition object not ready. No explicit stop needed.');
    }
  }, []);

  return { isListening, statusMessage, startListening, stopListening, setStatusMessage };
};

