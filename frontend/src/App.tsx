// App.tsx
import React, { useState, useRef, useEffect } from 'react';
// 導入 App.css，它包含了所有樣式
import './App.css'; 

// 導入醫院 Logo 圖片
import HospitalLogo from './assets/logo.png'; 

// 導入您的組件
import InfoSection from './components/InfoSection';
import SubObSection from './components/SubObSection';
import AstSection from './components/AstSection';
import PlanSection from './components/PlanSection';
import UserManagement from './components/UserManagement';
import TopBar from './components/TopBar';
// 導入 ObjectiveSelectorModal
import ObjectiveSelectorModal from './components/ObjectiveSelectorModal';

// 導入 patientService，包含 PatientData 介面和相關服務函式
import { PatientData, getPatientForCurrentUser, savePatientData, ObjectiveDetail } from './services/patientService';


function App() {
  // 登入和使用者資訊的 State 變數
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('currentUser'));
  const [currentRole, setCurrentRole] = useState<string | null>(() => localStorage.getItem('currentRole'));
  const [currentName, setCurrentName] = useState<string | null>(() => localStorage.getItem('currentName'));
  const [currentTitle, setCurrentTitle] = useState<string | null>(() => localStorage.getItem('currentTitle'));
  const [currentDept, setCurrentDept] = useState<string | null>(() => localStorage.getItem('currentDept'));
  
  // 登入表單的 State 變數
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // UI 狀態
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 密碼修改模態框狀態
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');

  // 病患資料狀態 (PatientData 應該符合 chtno.json 格式)
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [aiPlanText, setAiPlanText] = useState('');

  // 免責聲明狀態
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Objective 細項選擇模態框狀態
  const [showObjectiveSelector, setShowObjectiveSelector] = useState(false);
  // 已選中的 Objective 細項 (儲存原始行內容，方便組合回文本框)
  const [selectedObjectiveDetails, setSelectedObjectiveDetails] = useState<string[]>([]);


  // 點擊菜單外部時關閉菜單
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
      // 登入 API URL，請確保與您的後端 FastAPI 運行地址一致
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
        // 登入成功後，顯示免責聲明，等待用戶確認
        setShowDisclaimer(true); 
        // 將登入憑證暫存到 localStorage，待用戶同意免責聲明後再正式設置
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


  // 登出函式
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
      // 修改密碼 API URL，請確保與您的後端 FastAPI 運行地址一致
      const response = await fetch('/auth/change-password', {
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

  // 處理載入病人資料函式 (無需輸入病歷號)
  const handleLoadPatientData = async () => {
      setLoading(true);
      setError('');
      try {
          // 直接呼叫服務函式，獲取當前用戶的病患資料
          const data = await getPatientForCurrentUser(); 
          
          if (data) {
              setPatientData(data); // data 現在應該是 chtno.json 格式
              // 初始化已選中的 Objective 細項為所有解析出的原始行
              setSelectedObjectiveDetails(data.ObjectiveDetails?.map(d => d.original_line) || []);
              console.log('App.tsx: 成功載入當前病患資料。', data);
	      console.log('App.tsx: 接收到的 Subjective:', data.Subjective);
	      console.log('App.tsx: 接收到的 ObjectiveDetails:', data.ObjectiveDetails);
              alert('病人資料已成功載入！');
          } else {
              setPatientData(null); 
              setSelectedObjectiveDetails([]); // 清空已選中的細項
              alert('找不到當前使用者的病人資料。請確認您的資料目錄下有 OPD.json 檔案。');
              console.warn('App.tsx: getPatientForCurrentUser 返回空資料。');
          }
      } catch (err) {
          console.error(`App.tsx: 讀取當前病患資料失敗:`, err);
          setError(`讀取當前病患資料失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
          setPatientData(null); 
          setSelectedObjectiveDetails([]); // 清空已選中的細項
      } finally {
          setLoading(false);
      }
  };

  // 處理儲存病人資料函式
  const handleSavePatientData = async () => {
    if (!patientData) {
      setSaveMessage("沒有可儲存的病患資料。");
      setTimeout(() => setSaveMessage(''), 3000); 
      return;
    }
    setIsSaving(true);
    setSaveMessage("儲存中...");
    try {
      // patientData 已經是 chtno.json 格式，發送給後端
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

  // 處理 LLM 生成 SOAP 內容的回調
  const handleGeneratedSOAP = (generatedText: string) => {
    const planMatch = generatedText.match(/### Plan\s*([\s\S]*)/i);
    setAiPlanText(planMatch ? planMatch[1].trim() : "AI did not provide a plan.");
  };

  // 處理 Objective 細項選擇模態框的確認
  const handleObjectiveDetailsSelected = (selectedItems: string[]) => {
    setSelectedObjectiveDetails(selectedItems); // 更新已選中的細項
    setShowObjectiveSelector(false); // 關閉模態視窗
    // 將選中的 Objective 細項組合回 patientData.Objective 文本框
    if (patientData) {
        setPatientData({ ...patientData, Objective: selectedItems.join('\r\n') });
    }
  };


  // 根據登入狀態和免責聲明狀態渲染不同的介面
  if (!loggedIn && !showDisclaimer) { 
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
      
      {/* 密碼修改模態框 */}
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
              // Objective 文本框顯示的是已選中的細項內容，用換行符連接
              objective={selectedObjectiveDetails.join('\n')} 
              onChange={({ subjective, objective }) => {
                if (patientData) {
                  // 更新時也應更新為 chtno.json 格式的欄位
                  setPatientData({ ...patientData, Subjective: subjective, Objective: objective });
                  // 如果用戶手動修改了 Objective 文本框，這裡可以選擇重新解析並更新 selectedObjectiveDetails
                  // 但這需要一個將 Objective 字符串解析回 ObjectiveDetail[] 的輔助函數
                }
              }}
              onGenerateSOAP={handleGeneratedSOAP}
              // 傳遞觸發 Objective 細項選擇模態框的函式
              onSelectObjectiveDetails={() => setShowObjectiveSelector(true)} 
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

      {/* Objective 細項選擇模態框 */}
      {showObjectiveSelector && patientData?.ObjectiveDetails && (
        <ObjectiveSelectorModal
          objectiveDetails={patientData.ObjectiveDetails}
          initialSelection={selectedObjectiveDetails} // 傳遞當前已選中的項目
          onConfirm={handleObjectiveDetailsSelected} // 確認選擇後的回調
          onCancel={() => setShowObjectiveSelector(false)} // 取消後關閉模態框
        />
      )}
    </div>
  );
}

export default App;

