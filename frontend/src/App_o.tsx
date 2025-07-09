// App.tsx
import React, { useState, useRef, useEffect } from 'react';
import './App.css'; 

// 導入您的 Logo 圖片
import HospitalLogo from './assets/logo.png'; 

// 請確保這些元件檔案在正確的路徑上，例如：./components/InfoSection.tsx
import InfoSection from './components/InfoSection';
import SubObSection from './components/SubObSection';
import AstSection from './components/AstSection';
import PlanSection from './components/PlanSection';
import UserManagement from './components/UserManagement';

// 導入更新後的 patientService，現在包括 getPatientForCurrentUser
import { PatientData, getPatientForCurrentUser, savePatientData } from './services/patientService';
import TopBar from './components/TopBar';

function App() {
  // 恢復所有登入和使用者資訊的 State 變數
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('currentUser'));
  const [currentRole, setCurrentRole] = useState<string | null>(() => localStorage.getItem('currentRole'));
  const [currentName, setCurrentName] = useState<string | null>(() => localStorage.getItem('currentName'));
  const [currentTitle, setCurrentTitle] = useState<string | null>(() => localStorage.getItem('currentTitle'));
  const [currentDept, setCurrentDept] = useState<string | null>(() => localStorage.getItem('currentDept'));
  
  // 恢復登入表單的 State 變數
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // UI state
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Password modal state
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  // Patient data state (PatientData 應該符合 chtno.json 格式)
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [aiPlanText, setAiPlanText] = useState('');

  // 免責聲明 State
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 登入函式
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('帳號和密碼不得為空');
      return;
    }
    setError('');

    try {
      // 這裡的 URL 假設您的登入 API 在後端運行於 10.28.141.12:8000
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 如果登入成功，則顯示免責聲明，而不是直接登入
        setShowDisclaimer(true); 
        // 暫時不設置 loggedIn，等待用戶同意免責聲明
        // 但可以先儲存一些臨時數據，用於免責聲明後的最終登入
        localStorage.setItem('tempToken', data.access_token);
        localStorage.setItem('tempCurrentUser', data.username);
        localStorage.setItem('tempCurrentRole', data.role);
        localStorage.setItem('tempCurrentName', data.name);
        localStorage.setItem('tempCurrentTitle', data.title);
        localStorage.setItem('tempCurrentDept', data.department);

        console.log('App.tsx: 登入憑證已獲取，等待免責聲明確認。');
      } else {
        let errorMessage = '登入失敗，請檢查帳號密碼。';
        if (data.detail) {
          if (typeof data.detail === 'string') {
            errorMessage = data.detail;
          } else if (Array.isArray(data.detail)) {
            errorMessage = data.detail[0]?.msg || '輸入資料有誤。';
          }
        }
        setError(errorMessage);
        console.error('App.tsx: 登入失敗:', errorMessage);
      }
    } catch (err) {
      console.error('App.tsx: 登入錯誤:', err);
      setError('伺服器連線失敗或發生未知錯誤。');
    }
  };

  // 免責聲明同意後的最終登入處理
  const handleDisclaimerAgree = () => {
    // 從臨時儲存中獲取數據並設置為最終登入狀態
    setLoggedIn(true);
    setCurrentUser(localStorage.getItem('tempCurrentUser'));
    setCurrentRole(localStorage.getItem('tempCurrentRole'));
    setCurrentName(localStorage.getItem('tempCurrentName'));
    setCurrentTitle(localStorage.getItem('tempCurrentTitle'));
    setCurrentDept(localStorage.getItem('tempCurrentDept'));
    localStorage.setItem('token', localStorage.getItem('tempToken') || ''); // 將臨時 token 設為正式 token

    // 清除臨時儲存
    localStorage.removeItem('tempToken');
    localStorage.removeItem('tempCurrentUser');
    localStorage.removeItem('tempCurrentRole');
    localStorage.removeItem('tempCurrentName');
    localStorage.removeItem('tempCurrentTitle');
    localStorage.removeItem('tempCurrentDept');

    setShowDisclaimer(false); // 隱藏免責聲明
    console.log('App.tsx: 免責聲明已同意，已完成登入。');
  };

  // 免責聲明取消處理
  const handleDisclaimerCancel = () => {
    // 清除所有臨時儲存的登入數據
    localStorage.removeItem('tempToken');
    localStorage.removeItem('tempCurrentUser');
    localStorage.removeItem('tempCurrentRole');
    localStorage.removeItem('tempCurrentName');
    localStorage.removeItem('tempCurrentTitle');
    localStorage.removeItem('tempCurrentDept');

    setShowDisclaimer(false); // 隱藏免責聲明
    setLoggedIn(false); // 確保未登入狀態
    setUsername(''); // 清空登入表單
    setPassword('');
    setError('您已取消登入。'); // 顯示取消訊息
    console.log('App.tsx: 免責聲明已取消，登入中斷。');
  };


  // 恢復登出函式
  const handleLogout = () => {
    setLoggedIn(false);
    localStorage.clear(); // 清空所有 localStorage 數據，包括 token 和 temp 數據
    setPatientData(null);
    setAiPlanText('');
    setShowUserMgmt(false); // 登出後回到主頁
    console.log('App.tsx: 已登出，localStorage 已清空。');
  };
  
  // 處理密碼修改邏輯
  const handleChangePassword = async () => { 
    if (pwd1 === '' || pwd2 === '') {
      setPwdMsg('密碼不能為空');
      return;
    }
    if (pwd1 !== pwd2) {
      setPwdMsg('兩次輸入的密碼不一致');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://10.28.141.12:8000/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_password: pwd1 })
      });
      const data = await response.json();
      if (response.ok) {
        setPwdMsg('密碼修改成功！');
        setPwd1('');
        setPwd2('');
        setTimeout(() => setShowPwdModal(false), 1500);
      } else {
        setPwdMsg(`修改失敗: ${data.detail || '未知錯誤'}`);
      }
    } catch (error) {
      setPwdMsg('修改密碼時發生錯誤');
      console.error('Change password error:', error);
    }
  };

  // --- 修改：handleLoadPatientData 函式，直接呼叫新服務函式，不再彈出提示框 ---
  const handleLoadPatientData = async () => {
      setLoading(true);
      setError('');
      try {
          const data = await getPatientForCurrentUser(); // 直接呼叫獲取當前用戶資料的服務
          
          if (data) {
              setPatientData(data); // data 現在應該是 chtno.json 格式
              console.log('App.tsx: 成功載入當前病患資料。', data);
              alert('病人資料已成功載入！');
          } else {
              setPatientData(null); 
              alert('找不到當前使用者的病人資料。請確認您的資料目錄下有 OPD.json 檔案。');
              console.warn('App.tsx: getPatientForCurrentUser 返回空資料。');
          }
      } catch (err) {
          console.error(`App.tsx: 讀取當前病患資料失敗:`, err);
          setError(`讀取當前病患資料失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
          setPatientData(null); 
      } finally {
          setLoading(false);
      }
  };

  const handleSavePatientData = async () => {
    if (!patientData) {
      setSaveMessage("沒有可儲存的病患資料。");
      setTimeout(() => setSaveMessage(''), 3000); 
      return;
    }
    setIsSaving(true);
    setSaveMessage("儲存中...");
    try {
      // patientData 已經是 chtno.json 格式，但 savePatientData 可能仍需要 OPD.json 格式來儲存
      // 這裡需要確保 savePatientData 能夠處理 chtno.json 格式的輸入，或者進行反向轉換
      await savePatientData(patientData); 
      setSaveMessage("儲存成功！");
      console.log('App.tsx: 成功儲存病患資料。');
    } catch (err: any) {
      setSaveMessage(`儲存失敗: ${err.message}`);
      console.error('App.tsx: 儲存病患資料失敗:', err);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleGeneratedSOAP = (generatedText: string) => {
    const planMatch = generatedText.match(/### Plan\s*([\s\S]*)/i);
    setAiPlanText(planMatch ? planMatch[1].trim() : "AI did not provide a plan.");
  };

  // 恢復登入條件渲染
  if (!loggedIn && !showDisclaimer) { // 當未登入且沒有顯示免責聲明時，顯示登入頁面
    return ( 
      <div className="login-container"> 
        <div className="login-card"> 
          <img 
            src={HospitalLogo} 
            alt="馬偕紀念醫院 Logo" 
            className="hospital-logo" 
            onError={(e) => {
              e.currentTarget.onerror = null; 
              e.currentTarget.src = "https://placehold.co/250x70/E0E0E0/333333?text=馬偕紀念醫院";
            }}
          />
          <h1 className="login-title">AI 智慧門診登入系統</h1> 
          <form onSubmit={handleLogin}>
            <div className="input-group"> 
              <label htmlFor="username">帳號</label>
              <input 
                type="text" 
                id="username" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                placeholder="請輸入帳號" 
                required 
                className="login-input" 
              />
            </div>
            <div className="input-group"> 
              <label htmlFor="password">密碼</label>
              <input 
                type="password" 
                id="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="請輸入密碼" 
                required 
                className="login-input" 
              />
            </div>
            {error && <p className="error-message">{error}</p>} 
            <button type="submit" className="login-button">登入</button> 
          </form>
        </div>
      </div>
    );
  }

  // 免責聲明模態框渲染
  if (showDisclaimer) {
    return (
      <div className="modal-bg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="modal-box" style={{ maxWidth: '600px', width: '90%' }}>
            <h3>免責聲明</h3>
            <div className="disclaimer-content" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '15px', marginBottom: '20px', lineHeight: '1.6' }}>
                <p>本系統所顯示之醫療資訊僅供參考，不應取代專業醫療建議、診斷或治療。</p>
                <p>使用者應自行對其使用本系統所獲得之資訊負責，並在任何醫療決策前諮詢合格的醫療專業人員。</p>
                <p>本系統不保證資訊的完整性、準確性、時效性或適用性，亦不對因使用或無法使用本系統所導致的任何損害承擔責任。</p>
                <p>您同意所有輸入或產生的資料將依照本院隱私政策和資料使用條款進行處理。</p>
                <p>請仔細閱讀並理解以上條款。點擊「我同意並登入」即表示您已閱讀、理解並同意本免責聲明的全部內容。</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <input type="checkbox" id="agreeToDisclaimer" style={{ marginRight: '10px', width: 'auto' }} /> 
                我已閱讀並同意以上免責聲明
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={handleDisclaimerCancel} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>取消</button>
                <button onClick={() => {
                    const agreeCheckbox = document.getElementById('agreeToDisclaimer') as HTMLInputElement;
                    if (agreeCheckbox && agreeCheckbox.checked) {
                        handleDisclaimerAgree();
                    } else {
                        alert('您必須勾選同意免責聲明才能繼續！');
                    }
                }} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>我同意並登入</button>
            </div>
        </div>
      </div>
    );
  }


  // 主應用程式介面渲染
  return (
    <div className="main-container">
      <TopBar
        onLoadPatient={handleLoadPatientData} // 這裡會呼叫修改後的函式
        loading={loading} error={error}
        currentDept={currentDept} currentName={currentName} currentTitle={currentTitle}
        onLogoClick={() => setShowUserMgmt(false)} onSavePatient={handleSavePatientData}
        isSaving={isSaving} canSave={!!patientData} saveMessage={saveMessage}
      >
        <div className="topbar-menu-wrapper" ref={menuRef}>
          <button className="topbar-menu-btn" onClick={() => setMenuOpen(v => !v)}>☰</button>
          {menuOpen && (
            <div className="topbar-menu-dropdown">
              <button onClick={() => { setShowPwdModal(true); setMenuOpen(false); }}>修改密碼</button>
              {(currentRole === 'admin' || currentRole === 'manager') && (
                <button onClick={() => { setShowUserMgmt(v => !v); setMenuOpen(false); }}>
                  {showUserMgmt ? '返回主頁' : '用戶管理'}
                </button>
              )}
              <button onClick={handleLogout}>登出</button> 
            </div>
          )}
        </div>
      </TopBar>
      
      {showPwdModal && ( 
        <div className="modal-bg">
            <div className="modal-box">
              <h3>修改密碼</h3>
              <input type="password" placeholder="新密碼" value={pwd1} onChange={e => setPwd1(e.target.value)} />
              <input type="password" placeholder="確認新密碼" value={pwd2} onChange={e => setPwd2(e.target.value)} />
              <div style={{ color: pwdMsg.includes('成功') ? 'green' : 'red', minHeight: 20 }}>{pwdMsg}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={handleChangePassword}>儲存</button>
                <button onClick={() => { setShowPwdModal(false); setPwd1(''); setPwd2(''); setPwdMsg(''); }}>取消</button>
              </div>
            </div>
          </div>
       )}

      <div className="main-content">
        {showUserMgmt ? (
          <UserManagement currentRole={currentRole || ''} currentUser={currentUser || ''} />
        ) : (
          <>
            <InfoSection patientData={patientData} />
            <SubObSection
              // 確保這裡傳遞的是 chtno.json 格式的 Subjective 和 Objective 欄位
              subjective={patientData?.Subjective ?? ''}
              objective={patientData?.Objective ?? ''}
              onChange={({ subjective, objective }) => {
                if (patientData) {
                  // 更新時也應更新為 chtno.json 格式的欄位
                  setPatientData({ ...patientData, Subjective: subjective, Objective: objective });
                }
              }}
              onGenerateSOAP={handleGeneratedSOAP}
            />
            <AstSection
              // 確保這裡傳遞的是 chtno.json 格式的 Assessment 欄位
              subjectiveText={patientData?.Subjective}
              assessment={patientData?.Assessment}
              onChange={newAssessment => {
                if (patientData) {
                  // 更新時也應更新為 chtno.json 格式的欄位
                  setPatientData({ ...patientData, Assessment: newAssessment });
                }
              }}
            />
            <PlanSection planText={aiPlanText} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
