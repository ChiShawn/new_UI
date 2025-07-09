import React, { useState, useEffect } from 'react';
import '../styles/PlanSection.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone } from '@fortawesome/free-solid-svg-icons';

// --- 新增 Props 介面，用來接收從 App.tsx 傳來的 AI 生成文字 ---
interface PlanSectionProps {
  planText: string;
}

// 常數保持不變
const FREQ_OPTIONS = ['QD', 'BID', 'TID', 'QID', 'HS', 'PRN'];
const ROUTE_OPTIONS = ['口服', '靜脈注射', '肌肉注射', '皮下注射', '外用', '其他'];
const POWDER_OPTIONS = ['','是','否'];
const PACK_OPTIONS = ['','是','否'];

const PlanSection: React.FC<PlanSectionProps> = ({ planText }) => {
  // 手動輸入的治療計畫表格狀態 (保持不變)
  const [planList, setPlanList] = useState([
    { name: '', dose: '', freq: '', route: '', days: '', total: '', note: '', powder: '', pack: '' },
  ]);

  const handleChange = (idx: number, key: string, value: string) => {
    setPlanList(list => list.map((row, i) => i === idx ? { ...row, [key]: value } : row));
  };
  
  // --- 新增：一個新的 state 用來顯示 AI 建議，並允許使用者編輯 ---
  const [aiSuggestion, setAiSuggestion] = useState('');

  // 當從 props 接收到的 planText 變動時，更新 state
  useEffect(() => {
    setAiSuggestion(planText);
  }, [planText]);


  return (
    <div className="plan-card plan">
      <div className="plan-header">
        <span className="plan-title">Plan<span className="plan-section-sub">治療計畫</span></span>
      </div>
      
      {/* --- 新增的 AI 建議區塊 --- */}
      <div className="ai-suggestion-container">
        <label className="ai-suggestion-label">AI 建議 (Plan)</label>
        <textarea
          className="ai-suggestion-textarea"
          value={aiSuggestion}
          onChange={(e) => setAiSuggestion(e.target.value)}
          rows={5}
          placeholder="點擊右下角「生成 SOAP」按鈕後，AI 生成的治療計畫將顯示於此處..."
        />
      </div>
      {/* --- 新增區塊結束 --- */}

      <div className="plan-toolbar-row">
        <button className="plan-btn plan-green-btn">推論</button>
        <input className="plan-search" placeholder="請輸入藥品/醫囑" />
        <button className="plan-btn plan-red-btn">
          <FontAwesomeIcon icon={faMicrophone} />
        </button>
      </div>
      <table className="plan-table">
        <thead>
          <tr><th>項次</th><th>藥名/醫囑名</th><th>用量</th><th>頻次</th><th>途徑</th><th>天數</th><th>總量</th><th>備註</th><th>磨粉</th><th>分包</th></tr>
        </thead>
        <tbody>
          {planList.map((row, idx) => (
            <tr key={idx}>
              <td>{idx+1}</td>
              <td><input value={row.name} onChange={e => handleChange(idx, 'name', e.target.value)} style={{width:'100%'}} /></td>
              <td><input value={row.dose} onChange={e => handleChange(idx, 'dose', e.target.value)} style={{width:'100%'}} /></td>
              <td>
                <select value={row.freq} onChange={e => handleChange(idx, 'freq', e.target.value)} style={{width:'100%'}}>
                  <option value="">請選擇</option>
                  {FREQ_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </td>
              <td>
                <select value={row.route} onChange={e => handleChange(idx, 'route', e.target.value)} style={{width:'100%'}}>
                  <option value="">請選擇</option>
                  {ROUTE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </td>
              <td><input value={row.days} onChange={e => handleChange(idx, 'days', e.target.value)} style={{width:'100%'}} /></td>
              <td><input value={row.total} onChange={e => handleChange(idx, 'total', e.target.value)} style={{width:'100%'}} /></td>
              <td><input value={row.note} onChange={e => handleChange(idx, 'note', e.target.value)} style={{width:'100%'}} /></td>
              <td>
                <select value={row.powder} onChange={e => handleChange(idx, 'powder', e.target.value)} style={{width:'100%'}}>
                  {POWDER_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </td>
              <td>
                <select value={row.pack} onChange={e => handleChange(idx, 'pack', e.target.value)} style={{width:'100%'}}>
                  {PACK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlanSection;

