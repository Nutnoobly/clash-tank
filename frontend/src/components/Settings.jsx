import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { validateSettings } from '../lib/commands.js';

export default function Settings({ settings, connection, onConnect, onDisconnect, onClose }) {
  const [form, setForm] = useState(settings);
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);
  const titleRef = useRef(null);
  const connecting = connection === 'connecting';

  useEffect(() => { titleRef.current?.focus(); }, []);

  function submit(event) {
    event.preventDefault();
    const next = validateSettings(form);
    setErrors(next);
    if (Object.keys(next).length) {
      formRef.current.elements.namedItem(Object.keys(next)[0])?.focus();
      return;
    }
    onConnect({ ...form, brokerUrl: form.brokerUrl.trim(), voiceTopic: form.voiceTopic.trim(), username: form.username.trim() });
  }

  const fields = [
    ['brokerUrl', 'ที่อยู่ Broker (WSS)', 'wss://your-broker:8884/mqtt', 'url'],
    ['username', 'ชื่อผู้ใช้ (ถ้าต้องใช้)', 'เว้นว่างได้ หาก broker ไม่ต้องล็อกอิน', 'text'],
    ['password', 'รหัสผ่าน (ถ้าต้องใช้)', 'รหัสผ่านของ broker', 'password'],
    ['voiceTopic', 'Voice topic', 'ตรงกับ TOPIC_VOICE ของเซิร์ฟเวอร์', 'text'],
  ];

  return <section className="settings-page" aria-labelledby="settings-title">
    <header className="header settings-header">
      <button type="button" className="icon-button" onClick={onClose} aria-label="กลับหน้าสั่งรถ"><Icon name="settings-IconBack" size={24} /></button>
      <h1 id="settings-title" className="settings-title" tabIndex={-1} ref={titleRef}>การตั้งค่า</h1>
      <span className="header-spacer" />
    </header>
    <p className="settings-intro">ตั้งค่าครั้งเดียว แล้วกลับไปสั่งรถ</p>
    <form ref={formRef} onSubmit={submit} className="settings-form" noValidate>
      <div className="fields">
        {fields.map(([name, label, placeholder, type]) => <div className="field" key={name}>
          <label htmlFor={name}>{label}</label>
          <input id={name} name={name} type={type} placeholder={placeholder}
            value={form[name]} required={name === 'brokerUrl' || name === 'voiceTopic'}
            onChange={event => { setForm(current => ({ ...current, [name]: event.target.value })); setErrors(current => ({ ...current, [name]: '' })); }}
            autoComplete={name === 'password' ? 'current-password' : name === 'username' ? 'username' : 'off'}
            autoCapitalize="none" spellCheck={false} maxLength={2048}
            aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} />
          {errors[name] && <p className="field-error" id={`${name}-error`}>{errors[name]}</p>}
        </div>)}
        <p className="small muted">ใช้ URL และ topic จากทีม backend<br />รหัสผ่านจะไม่ถูกบันทึกในเครื่อง</p>
      </div>
      <div className="settings-actions">
        {connection === 'connected' && <button type="button" className="button secondary" onClick={onDisconnect}>ตัดการเชื่อมต่อ</button>}
        <button type="submit" className="button primary" disabled={connecting}>
          {!connecting && <Icon name="settings-IconArrow" size={20} />}
          {connecting ? 'กำลังเชื่อมต่อ…' : 'บันทึกและเชื่อมต่อ'}
        </button>
        <p className="small muted">จำ URL ชื่อผู้ใช้ และ topic ไว้บนอุปกรณ์นี้</p>
      </div>
    </form>
  </section>;
}
