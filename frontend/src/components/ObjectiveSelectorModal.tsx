// src/components/ObjectiveSelectorModal.tsx (確保這個檔案存在且內容正確)
import React, { useState, useEffect } from 'react';
import { ObjectiveDetail } from '../services/patientService'; // 確保路徑正確

interface ObjectiveSelectorModalProps {
  objectiveDetails: ObjectiveDetail[];
  initialSelection: string[];
  onConfirm: (selectedItems: string[]) => void;
  onCancel: () => void;
}

const ObjectiveSelectorModal: React.FC<ObjectiveSelectorModalProps> = ({
  objectiveDetails,
  initialSelection,
  onConfirm,
  onCancel,
}) => {
  const [currentSelection, setCurrentSelection] = useState<Set<string>>(new Set(initialSelection));

  useEffect(() => {
    setCurrentSelection(new Set(initialSelection));
  }, [objectiveDetails, initialSelection]);

  const handleCheckboxChange = (originalLine: string, isChecked: boolean) => {
    setCurrentSelection((prevSelection) => {
      const newSelection = new Set(prevSelection);
      if (isChecked) {
        newSelection.add(originalLine);
      } else {
        newSelection.delete(originalLine);
      }
      return newSelection;
    });
  };

  const handleConfirm = () => {
    const orderedSelection = objectiveDetails
      .filter(detail => currentSelection.has(detail.original_line))
      .map(detail => detail.original_line);

    onConfirm(orderedSelection);
  };

  return (
    <div className="modal-bg" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="modal-box" style={{ maxWidth: '700px', width: '90%' }}>
        <h3>選擇 Objective 細項</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px', border: '1px solid #eee', padding: '10px' }}>
          {objectiveDetails.length > 0 ? (
            objectiveDetails.map((detail, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  id={`obj-detail-${index}`}
                  checked={currentSelection.has(detail.original_line)}
                  onChange={(e) => handleCheckboxChange(detail.original_line, e.target.checked)}
                  style={{ marginRight: '10px', width: 'auto' }}
                />
                <label htmlFor={`obj-detail-${index}`} style={{ flexGrow: 1 }}>
                  <strong>{detail.key}:</strong> {detail.value}
                </label>
              </div>
            ))
          ) : (
            <p>沒有可供選擇的 Objective 細項。</p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onCancel} style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>取消</button>
          <button onClick={handleConfirm} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>確認選擇</button>
        </div>
      </div>
    </div>
  );
};

export default ObjectiveSelectorModal;
