import React, { useEffect, useState } from 'react';
import '../styles/UserManagement.css';

interface User {
  username: string;
  password: string;
  name: string;
  department: string;
  title: string;
  role: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login: string;
  avatar: string;
  note: string;
}

const API_URL = 'http://10.28.141.12:9988/auth/users';
//const API_URL = 'http://10.28.141.12:3001/auth/users';

const DEPARTMENTS = [
  '內科', '外科', '婦產科', '小兒科', '急診醫學科', '骨科', '耳鼻喉科', '眼科', '皮膚科', '泌尿科', '神經科', '心臟科', '腎臟科', '胸腔科', '感染科', '復健科', '放射科', '麻醉科', '精神科', '整形外科', '牙科', '其他'
];
const TITLES = ['院長/主治醫師','副院長/主治醫師','主任/主治醫師','主治醫師', '住院醫師', '實習醫師', '其他'];
const ROLES = ['manager', 'user'];

const UserManagement: React.FC<{ currentRole: string | null, currentUser: string | null }> = ({ currentRole, currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStatus, setNewStatus] = useState('active');
  const [newAvatar, setNewAvatar] = useState('');
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<User>>({});
  const [msg, setMsg] = useState('');
  const [emailValid, setEmailValid] = useState(true);
  const [editEmailValid, setEditEmailValid] = useState(true);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [targetUsername, setTargetUsername] = useState('');

  // 取得所有用戶
  const fetchUsers = async () => {
    const res = await fetch(API_URL);
    const data = await res.json();
    setUsers(data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // 新增用戶
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newUser || !newPass || !newName || !newDept || !newTitle || !newRole || !newEmail || !newPhone || !newStatus) {
      setError('所有欄位皆為必填');
      return;
    }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUser,
          password: newPass,
          name: newName,
          department: newDept,
          title: newTitle,
          role: newRole,
          email: newEmail,
          phone: newPhone,
          status: newStatus,
          avatar: newAvatar,
          note: newNote
        })
      });
      if (res.ok) {
        setNewUser(''); setNewPass(''); setNewName(''); setNewDept(''); setNewTitle(''); setNewRole('user'); setNewEmail(''); setNewPhone(''); setNewStatus('active'); setNewAvatar(''); setNewNote('');
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.detail || '新增失敗');
      }
    } catch {
      setError('伺服器連線失敗');
    }
  };

  // 編輯用戶
  const handleEditUser = (user: User) => {
    setEditingUser(user.username);
    setEditFields({
      ...user,
      role: ROLES.includes(user.role) ? user.role : 'user'
    });
    setMsg('');
  };

  const handleEditFieldChange = (field: keyof User, value: string) => {
    setEditFields(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async (username: string) => {
    setMsg('');
    // 不傳 created_at、updated_at、last_login
    const { created_at, updated_at, last_login, ...editData } = editFields;
    // 強制 role 只允許 user/manager
    const safeRole = ROLES.includes(editData.role as string) ? editData.role : 'user';
    const res = await fetch(`${API_URL}/${username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ ...editData, role: safeRole })
    });
    if (res.ok) {
      setEditingUser(null);
      setEditFields({});
      setMsg('修改成功');
      fetchUsers();
      setTimeout(() => setMsg(''), 1500);
    } else {
      const data = await res.json();
      setMsg(data.detail || '修改失敗');
    }
  };

  // 刪除用戶
  const handleDelete = async (username: string) => {
    if (!window.confirm(`確定要刪除用戶 ${username} 嗎？`)) return;
    await fetch(`${API_URL}/${username}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({})
    });
    fetchUsers();
  };

  const handleEmailChange = (v: string) => {
    setNewEmail(v);
    setEmailValid(/^\S+@\S+\.\S+$/.test(v));
  };

  const handleEditEmailChange = (v: string) => {
    setEditFields(prev => ({ ...prev, email: v }));
    setEditEmailValid(/^\S+@\S+\.\S+$/.test(v));
  };

  const handleChangePassword = (username: string) => {
    if (!username) {
      setError('找不到用戶名稱');
      return;
    }
    setTargetUsername(username);
    setShowChangePasswordModal(true);
    setError(''); // 清除之前的錯誤訊息
  };

  const handleClosePasswordModal = () => {
    setShowChangePasswordModal(false);
    setNewPassword('');
    setError('');
    setTargetUsername('');
  };

  const handleSaveNewPassword = async () => {
    if (!targetUsername) {
      setError('找不到用戶名稱，請重新選擇用戶');
      return;
    }
    if (!newPassword) {
      setError('新密碼不得為空');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/${targetUsername}/password`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        handleClosePasswordModal();
        setMsg('密碼修改成功');
        setTimeout(() => setMsg(''), 1500);
      } else {
        const data = await res.json();
        let errMsg = '';
        if (typeof data.detail === 'string') {
          errMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errMsg = data.detail.map((e: any) => e.msg).join('；');
        } else {
          errMsg = '密碼修改失敗';
        }
        setError(errMsg);
      }
    } catch (err) {
      console.error('更改密碼時發生錯誤:', err);
      setError('系統錯誤，請稍後再試');
    }
  };

  return (
    <div className="user-mgmt-container">
      <h2>用戶管理</h2>
      <form className="user-mgmt-form" onSubmit={handleAddUser} style={{ flexWrap: 'wrap' }}>
        <label>帳號：
          <input type="text" placeholder="帳號" value={newUser} onChange={e => setNewUser(e.target.value)} required />
        </label>
        <label>密碼：
          <input type="password" placeholder="密碼" value={newPass} onChange={e => setNewPass(e.target.value)} required />
        </label>
        <label>姓名：
          <input type="text" placeholder="姓名" value={newName} onChange={e => setNewName(e.target.value)} required />
        </label>
        <label>單位：
          <select value={newDept} onChange={e => setNewDept(e.target.value)} required>
            <option value="">請選擇</option>
            {DEPARTMENTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}
          </select>
        </label>
        <label>職稱：
          <select value={newTitle} onChange={e => setNewTitle(e.target.value)} required>
            <option value="">請選擇</option>
            {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>角色：
          <select value={newRole} onChange={e => setNewRole(e.target.value)} required>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>Email：
          <input type="email" placeholder="Email" value={newEmail} onChange={e => handleEmailChange(e.target.value)} required style={{ borderColor: emailValid ? undefined : 'red' }} />
          {!emailValid && <span style={{ color: 'red', fontSize: 12 }}>Email 格式錯誤</span>}
        </label>
        <label>電話：
          <input type="text" placeholder="電話" value={newPhone} onChange={e => setNewPhone(e.target.value)} required />
        </label>
        <label>狀態：
          <select value={newStatus} onChange={e => setNewStatus(e.target.value)} required>
            <option value="active">啟用</option>
            <option value="inactive">停用</option>
          </select>
        </label>
        <label>大頭貼網址：
          <input type="text" placeholder="大頭貼網址" value={newAvatar} onChange={e => setNewAvatar(e.target.value)} />
        </label>
        <label>備註：
          <input type="text" placeholder="備註" value={newNote} onChange={e => setNewNote(e.target.value)} />
        </label>
        <button type="submit" disabled={!emailValid}>新增</button>
      </form>
      {(error || msg) && <div className="user-mgmt-error">{error || msg}</div>}
      <ul className="user-mgmt-list">
        {users.map(user => (
          <li key={user.username} className="user-mgmt-list-item">
            {editingUser === user.username ? (
              <div className="user-mgmt-edit-fields">
                <label>姓名：
                  <input type="text" value={editFields.name || ''} onChange={e => handleEditFieldChange('name', e.target.value)} placeholder="姓名" required />
                </label>
                <label>單位：
                  <select value={editFields.department || ''} onChange={e => handleEditFieldChange('department', e.target.value)} required>
                    <option value="">請選擇</option>
                    {DEPARTMENTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}
                  </select>
                </label>
                <label>職稱：
                  <select value={editFields.title || ''} onChange={e => handleEditFieldChange('title', e.target.value)} required>
                    <option value="">請選擇</option>
                    {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>角色：
                  <select value={editFields.role ?? 'user'} onChange={e => handleEditFieldChange('role', e.target.value)} required>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>Email：
                  <input type="email" value={editFields.email || ''} onChange={e => handleEditEmailChange(e.target.value)} placeholder="Email" required style={{ borderColor: editEmailValid ? undefined : 'red' }} />
                  {!editEmailValid && <span style={{ color: 'red', fontSize: 12 }}>Email 格式錯誤</span>}
                </label>
                <label>電話：
                  <input type="text" value={editFields.phone || ''} onChange={e => handleEditFieldChange('phone', e.target.value)} placeholder="電話" required />
                </label>
                <label>狀態：
                  <select value={editFields.status || ''} onChange={e => handleEditFieldChange('status', e.target.value)} required>
                    <option value="active">啟用</option>
                    <option value="inactive">停用</option>
                  </select>
                </label>
                <label>大頭貼網址：
                  <input type="text" value={editFields.avatar || ''} onChange={e => handleEditFieldChange('avatar', e.target.value)} placeholder="大頭貼網址" />
                </label>
                <label>備註：
                  <input type="text" value={editFields.note || ''} onChange={e => handleEditFieldChange('note', e.target.value)} placeholder="備註" />
                </label>
                <div className="user-mgmt-edit-actions">
                  <button onClick={() => handleSaveEdit(user.username)} disabled={!editEmailValid}>儲存</button>
                  <button onClick={() => { setEditingUser(null); setEditFields({}); }}>取消</button>
                </div>
              </div>
            ) : (
              <div className="user-mgmt-list-item-content">
                <div className="user-mgmt-list-item-header">
                  <span className="user-mgmt-list-item-username">{user.username}</span>
                  <span className="user-mgmt-list-item-status" style={{ color: user.status === 'active' ? 'green' : 'red' }}>
                    {user.status === 'active' ? '啟用' : '停用'}
                  </span>
                </div>
                <div className="user-mgmt-list-item-details">
                  <p>姓名：{user.name}</p>
                  <p>單位：{user.department}</p>
                  <p>職稱：{user.title}</p>
                  <p>角色：{user.role}</p>
                  <p>Email：{user.email}</p>
                  <p>電話：{user.phone}</p>
                  <p>備註：{user.note}</p>
                  <p>建立時間：{user.created_at}</p>
                  <p>最後更新：{user.updated_at}</p>
                  <p>最後登入：{user.last_login}</p>
                </div>
                <div className="user-mgmt-list-item-actions">
                  <button onClick={() => handleEditUser(user)}>編輯</button>
                  {(currentRole === 'admin' || currentRole === 'manager') && (
                    <button
                      onClick={async () => {
                        const newStatus = user.status === 'active' ? 'inactive' : 'active';
                        await fetch(`${API_URL}/${user.username}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                          body: JSON.stringify({ status: newStatus })
                        });
                        fetchUsers();
                      }}
                    >
                      {user.status === 'active' ? '禁用' : '啟用'}
                    </button>
                  )}
                  {currentRole === 'admin' && (
                    <button className="user-mgmt-delete-btn" onClick={() => handleDelete(user.username)}>刪除</button>
                  )}
                  <button onClick={() => handleChangePassword(user.username)}>更改密碼</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {showChangePasswordModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>更改密碼</h3>
            <div className="modal-body">
              {error && <div className="error-message" style={{ color: '#d32f2f', marginBottom: '12px' }}>{error}</div>}
              <input
                type="password"
                placeholder="請輸入新密碼"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', marginBottom: '12px' }}
              />
              <div className="modal-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={handleSaveNewPassword} disabled={!newPassword}>確認</button>
                <button onClick={handleClosePasswordModal}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

 
