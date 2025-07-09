import React from 'react';
import '../styles/InfoSection.css';
import { PatientData } from '../services/patientService';

interface InfoSectionProps {
  patientData: PatientData | null;
}

const InfoSection: React.FC<InfoSectionProps> = ({ patientData }) => {
  return (
    <div className="info-section">
      <div className="info-card">
        <div className="info-header">
          <span className="info-title">Information</span>
          <span className="info-section-sub">病患資料</span>
        </div>
        <div className="info-grid">
          {/* 第一列 */}
          <div className="info-label">診　　號：</div>
          <input type="text" readOnly value={patientData?.caseno  ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">病歷號碼：</div>
          <input type="text" readOnly value={patientData?.CHTNO ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">記錄日期：</div>
          <input type="text" readOnly value={patientData?.SCHDATE ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div></div>
          <div></div>
          <div></div>

          {/* 第二列 */}
          <div className="info-label">姓　　名：</div>
          <input type="text" readOnly value={patientData?.NAME ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">性　　別：</div>
          <input type="text" readOnly value={patientData?.GENDER ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">身　　高：</div>
          <input type="text" readOnly value={patientData?.HEIGHT ? `${patientData.HEIGHT} 公分` : ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">體　　重：</div>
          <input type="text" readOnly value={patientData?.WEIGHT ? `${patientData.WEIGHT} 公斤` : ''} className="info-readonly-input" />
          <div className="info-unit"></div>

          {/* 第三列 */}
          <div className="info-label">年　　齡：</div>
          <input type="text" readOnly value={patientData?.AGE ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">身　　份：</div>
          <input type="text" readOnly value={patientData?.IDENTITY ?? ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">脈　　搏：</div>
          <input type="text" readOnly value={patientData?.PULSE ? `${patientData.PULSE} 下/分` : ''} className="info-readonly-input" />
          <div className="info-unit"></div>
          <div className="info-label">血　　壓：</div>
          <input type="text" readOnly value={patientData?.BP ? `${patientData.BP} mmHg` : ''} className="info-readonly-input" />
          <div className="info-unit"></div>

          {/* 第四列 */}
          <div className="info-label">備　　註：</div>
          <input type="text" readOnly value={patientData?.NOTE ?? ''} className="info-readonly-input" style={{ gridColumn: 'span 4' }} />
          <div></div>
          <div className="info-label">過敏藥物：</div>
          <input type="text" readOnly value={patientData?.ALLERGY ?? ''} className="info-readonly-input info-allergy-input info-allergy-highlight" style={{ gridColumn: 'span 4' }} />
          <div></div>
        </div>
        <div className="info-exam-actions">
          {/* <button>讀取</button>
          <button>修改</button> */}
        </div>
      </div>
    </div>
  );
};

export default InfoSection; 
