import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
// 引入專門的 Login.css 檔案
import '../styles/Login.css'; // 【修正】: 從 App.css 改為 Login.css

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // 登入前先清空 localStorage，避免殘留舊 token/user
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗，請稍後再試');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    // 整個登入頁面的容器
    <div className="login-container">
      {/* 登入表單的容器 */}
      <form onSubmit={handleSubmit} className="login-form">
        <h2 className="login-title">診所系統登入</h2> {/* 添加一個 class 給標題 */}
        {error && <div className="error-message">{error}</div>}
        
        {/* 帳號輸入群組 */}
        <div className="form-group">
          <label htmlFor="username" className="form-label">帳號</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="form-input" // 添加 class
            placeholder="請輸入帳號"
          />
        </div>
        
        {/* 密碼輸入群組 */}
        <div className="form-group">
          <label htmlFor="password" className="form-label">密碼</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="form-input" // 添加 class
            placeholder="請輸入密碼"
          />
        </div>
        
        {/* 登入按鈕 */}
        <button type="submit" disabled={loading} className="login-button">
          {loading ? '登入中...' : '登入'}
        </button>
      </form>
    </div>
  );
};

export default Login;

