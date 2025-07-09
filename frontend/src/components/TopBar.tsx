import React, { useEffect, useState } from 'react';
import '../styles/TopBar.css';
import logo from '../assets/logo_w.png';

interface TopBarProps {
  onLoadPatient: () => void;
  loading: boolean;
  error?: string;
  currentDept?: string | null;
  currentName?: string | null;
  currentTitle?: string | null;
  onLogoClick: () => void;
  children?: React.ReactNode;
  onSavePatient?: () => void;
  isSaving?: boolean;
  canSave?: boolean;
  saveMessage?: string;
}

const TopBar: React.FC<TopBarProps> = ({
  onLoadPatient,
  loading,
  error,
  currentDept,
  currentName,
  currentTitle,
  onLogoClick,
  children,
  onSavePatient,
  isSaving,
  canSave,
  saveMessage
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | undefined>(saveMessage);

  useEffect(() => {
    if (saveMessage) {
      setDisplayMessage(saveMessage);
      // 如果是成功訊息，3秒後自動消失
      if (saveMessage.includes('成功')) {
        const timer = setTimeout(() => {
          setDisplayMessage(undefined);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [saveMessage]);

  // 當點擊讀取病人資料時，清除成功訊息
  const handleLoadPatient = () => {
    if (displayMessage?.includes('成功')) {
      setDisplayMessage(undefined);
    }
    onLoadPatient();
  };

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <img src={logo} alt="Logo" style={{ cursor: 'pointer' }} onClick={onLogoClick} />
        <button 
          className="clear-patient-btn"
          onClick={() => { if(window.confirm('確定要重置系統嗎？')) window.location.reload(); }}
          disabled={loading}
          style={{ marginRight: 8 }}
        >
          重置
        </button>
        <button 
          className="load-patient-btn"
          onClick={handleLoadPatient}
          disabled={loading}
        >
          {loading ? '讀取中...' : '讀取病人資料'}
        </button>
        {onSavePatient && (
          <>
            <button
              className="save-btn"
              onClick={onSavePatient}
              disabled={isSaving || !canSave}
              style={{ minWidth: 96, marginLeft: 8 }}
            >
              {isSaving ? '儲存中...' : '儲存資料'}
            </button>
            {displayMessage && (
              <span className="topbar-error-message" style={{ 
                color: displayMessage.includes('成功') ? '#2e7d32' : '#c62828',
                background: displayMessage.includes('成功') ? '#e8f5e9' : '#ffebee'
              }}>
                {displayMessage}
              </span>
            )}
          </>
        )}
        {error && <span className="topbar-error-message">{error}</span>}
      </div>
      <div className="top-bar-actions">
        <span style={{ marginRight: 16, color: '#fff', fontWeight: 500 }}>
          {currentDept && currentName && currentTitle ? `${currentDept}   ${currentName}   ${currentTitle}` : ''}
        </span>
        {children}
      </div>
    </div>
  );
};

export default TopBar; 