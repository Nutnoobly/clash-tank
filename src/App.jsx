import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import Settings from './components/Settings.jsx';
import Joystick from './components/Joystick.jsx';
import { createTransport } from './lib/transport.js';
import { createSpeechSession } from './lib/speech.js';
import { MAX_TEXT_LENGTH } from './lib/commands.js';
import { loadSettings, loadHistory, loadLanguage, saveSettings, writeStored, STORAGE_KEYS } from './lib/storage.js';

const LANGUAGES = { 'th-TH': 'ภาษาไทย', 'en-US': 'English' };

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...loadSettings(), password: '' }));
  const [history, setHistory] = useState(loadHistory);
  const [language, setLanguage] = useState(loadLanguage);
  const [connection, setConnection] = useState('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState('voice');
  const [phase, setPhase] = useState('ready');
  const [draft, setDraft] = useState('');
  const [interim, setInterim] = useState('');
  const [confidence, setConfidence] = useState(undefined);
  const [speechError, setSpeechError] = useState(null);
  const [sendError, setSendError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const transport = useRef(null);
  const speech = useRef(null);
  const speechGeneration = useRef(0);
  const sendGeneration = useRef(0);
  const connectionGeneration = useRef(0);
  const sendingRef = useRef(false);
  const stoppingRef = useRef(false);
  const languageDialog = useRef(null);
  const textInput = useRef(null);
  const settingsButton = useRef(null);
  const mounted = useRef(false);
  const online = connection === 'connected';
  const connectionLost = connection === 'offline' || connection === 'error';
  const listening = phase === 'listening' || phase === 'processing';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechAvailable = !!Recognition && window.isSecureContext;

  const abortSpeech = useCallback(() => {
    speechGeneration.current += 1;
    speech.current?.abort();
    speech.current = null;
    setInterim('');
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sendGeneration.current += 1;
      connectionGeneration.current += 1;
      transport.current?.close();
      speech.current?.abort();
    };
  }, []);

  useEffect(() => {
    function suspend() {
      if (!document.hidden) return;
      speech.current?.abort();
      speech.current = null;
      setPhase(current => ['listening', 'processing'].includes(current) ? 'ready' : current);
      setInterim('');
    }
    function offline() {
      connectionGeneration.current += 1;
      transport.current?.close();
      setConnection('offline');
      setConnectionError('อินเทอร์เน็ตขาด เชื่อมต่อใหม่เมื่อพร้อม');
      abortSpeech();
      setPhase(current => ['listening', 'processing'].includes(current) ? 'ready' : current);
    }
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('offline', offline);
    return () => {
      document.removeEventListener('visibilitychange', suspend);
      window.removeEventListener('offline', offline);
    };
  }, [abortSpeech]);

  useEffect(() => {
    if (!writeStored(STORAGE_KEYS.history, history)) {
      setStorageNotice('เบราว์เซอร์บันทึกข้อมูลไม่ได้ ประวัติจะอยู่เฉพาะครั้งนี้');
    }
  }, [history]);

  function persist(key, value) {
    if (!writeStored(key, value)) setStorageNotice('เบราว์เซอร์บันทึกข้อมูลไม่ได้ การตั้งค่าและประวัติจะอยู่เฉพาะครั้งนี้');
  }

  function openSettings() {
    abortSpeech();
    if (listening) setPhase('ready');
    setSettingsOpen(true);
  }

  async function connect(value = settings) {
    const generation = ++connectionGeneration.current;
    transport.current?.close();
    setSettings(value);
    if (!saveSettings(value)) setStorageNotice('บันทึกการตั้งค่าไม่ได้ แต่ยังเชื่อมต่อได้ตามปกติ');
    setSettingsOpen(false);
    setSendError('');
    setConnection('connecting');
    setConnectionError('');
    try {
      // Download the MQTT client only when the operator chooses to connect.
      const { default: mqtt } = await import('mqtt');
      if (!mounted.current || generation !== connectionGeneration.current) return;
      const current = createTransport(mqtt.connect, (state, error) => {
        if (!mounted.current || generation !== connectionGeneration.current) return;
        setConnection(state);
        setConnectionError(error);
      });
      transport.current = current;
      current.open(value);
    } catch {
      if (!mounted.current || generation !== connectionGeneration.current) return;
      setConnection('error');
      setConnectionError('โหลดตัวเชื่อมต่อไม่ได้ ลองรีเฟรชหน้าเว็บแล้วเชื่อมต่ออีกครั้ง');
    }
  }

  function disconnect() {
    connectionGeneration.current += 1;
    transport.current?.close();
    abortSpeech();
    setConnection('disconnected');
    setConnectionError('');
    if (listening) setPhase('ready');
  }

  function changeMode(value) {
    if (value === mode) return;
    abortSpeech();
    sendGeneration.current += 1;
    newCommand();
    setMode(value);
  }

  function startSpeech() {
    if (sendingRef.current || stoppingRef.current) return;
    if (!speechAvailable) { setSpeechError({ code: 'unsupported', message: window.isSecureContext
      ? 'เบราว์เซอร์นี้ไม่รองรับการถอดเสียง ลอง Safari บน iPhone หรือ Chrome บน Android หรือพิมพ์แทน'
      : 'เปิดเว็บผ่าน HTTPS เพื่อใช้ไมโครโฟน หรือพิมพ์คำสั่งแทน' }); return; }
    abortSpeech();
    const generation = speechGeneration.current;
    setDraft('');
    setConfidence(undefined);
    setSpeechError(null);
    setSendError('');
    setPhase('listening');
    const session = createSpeechSession(Recognition, language, {
      onInterim: value => { if (generation === speechGeneration.current) setInterim(value.slice(0, MAX_TEXT_LENGTH)); },
      onFinal: (value, score) => {
        if (generation !== speechGeneration.current) return;
        speech.current = null;
        setInterim('');
        if (value.length > MAX_TEXT_LENGTH) {
          setSpeechError({ code: 'too-long', message: 'คำสั่งยาวเกินไป ลองพูดสั้นลง ไม่เกิน 1,000 ตัวอักษร' });
          setPhase('ready');
          return;
        }
        setDraft(value);
        setConfidence(score);
        setPhase('review');
      },
      onError: (code, message) => {
        if (generation !== speechGeneration.current) return;
        speech.current = null;
        setSpeechError({ code, message });
        setInterim('');
        setPhase('ready');
      },
    });
    speech.current = session;
    session.start();
  }

  function finishSpeech() {
    setPhase('processing');
    speech.current?.stop();
  }

  function editDraft(value) {
    setDraft(value);
    // After an explicit edit, the recognizer's score no longer describes this text.
    setConfidence(undefined);
    setSendError('');
  }

  function reviewTyped(event) {
    event.preventDefault();
    if (draft.trim()) {
      abortSpeech();
      setConfidence(undefined);
      setSpeechError(null);
      setPhase('review');
    }
  }

  async function submit(stop = false) {
    if (!online || (stop ? stoppingRef.current : sendingRef.current || stoppingRef.current)) return;
    if (!stop && (!draft.trim() || listening || (confidence !== undefined && confidence < 0.5))) return;
    const generation = ++sendGeneration.current;
    if (stop) { stoppingRef.current = true; setStopping(true); abortSpeech(); setPhase('ready'); }
    else { sendingRef.current = true; setSending(true); }
    setSendError('');
    try {
      const payload = await transport.current.send(stop ? 'STOP' : draft, stop ? undefined : confidence);
      if (!mounted.current) return;
      const entry = { text: stop ? 'หยุดรถ' : payload.text, timestamp: payload.timestamp, stop };
      setHistory(current => {
        const next = [entry, ...current].slice(0, 3);
        return next;
      });
      if (generation === sendGeneration.current) {
        setReceipt(entry);
        setDraft('');
        setConfidence(undefined);
        setPhase('sent');
      }
    } catch (error) {
      if (mounted.current && generation === sendGeneration.current) setSendError(error.message);
    } finally {
      if (stop) { stoppingRef.current = false; if (mounted.current) setStopping(false); }
      else { sendingRef.current = false; if (mounted.current) setSending(false); }
    }
  }

  function newCommand() {
    setPhase('ready');
    setDraft('');
    setSpeechError(null);
    setSendError('');
    setReceipt(null);
  }

  function changeLanguage(value) {
    setLanguage(value);
    persist(STORAGE_KEYS.language, value);
    languageDialog.current.close();
  }

  const heading = phase === 'sent' ? (receipt?.stop ? 'ส่งคำสั่งหยุดแล้ว' : 'ส่งคำสั่งแล้ว')
    : phase === 'review' ? 'ตรวจคำสั่งก่อนส่ง' : phase === 'listening' ? 'กำลังฟังคุณ…'
    : phase === 'processing' ? 'กำลังถอดเสียง…' : speechError?.code === 'not-allowed' ? 'เปิดใช้ไมโครโฟน'
    : connectionLost ? 'ยังสั่งรถไม่ได้' : 'สั่งรถด้วยเสียง';
  const subtitle = phase === 'sent' ? (receipt?.stop ? 'ตรวจดูว่ารถหยุดก่อนเริ่มใหม่' : 'เริ่มคำสั่งใหม่ได้เมื่อพร้อม')
    : phase === 'review' ? 'แก้ไขข้อความได้ก่อนสั่งรถ' : listening ? 'พูดคำสั่งได้เลย ไม่ต้องกดค้าง'
    : connectionLost ? 'เชื่อมต่ออีกครั้งเพื่อส่งคำสั่ง' : 'พูด ตรวจข้อความ แล้วส่งคำสั่ง';
  const lowConfidence = confidence !== undefined && confidence < 0.5;
  const statusLabel = ({ connected: 'เชื่อมต่อแล้ว', connecting: 'กำลังเชื่อมต่อ…', offline: 'การเชื่อมต่อขาด', error: 'เชื่อมต่อไม่สำเร็จ', disconnected: 'ยังไม่ได้เชื่อมต่อ' })[connection];

  return <div className={`app-shell ${mode === 'joystick' && !settingsOpen ? 'joystick-mode' : ''}`}>
    {settingsOpen ? <Settings settings={settings} connection={connection} onConnect={connect} onDisconnect={disconnect}
      onClose={() => { setSettingsOpen(false); requestAnimationFrame(() => settingsButton.current?.focus()); }} /> : <>
      <header className="header">
        <a className="wordmark" href="#" aria-label="Clash Tank หน้าหลัก" onClick={event => { event.preventDefault(); changeMode('voice'); abortSpeech(); newCommand(); }}><span>CLASH</span><span>TANK</span></a>
        <div className="mode-switch" role="tablist" aria-label="โหมดควบคุม">
          {[['voice', 'เสียง'], ['joystick', 'จอย']].map(([value, label]) => <button key={value} type="button" role="tab" id={`${value}-tab`}
            aria-selected={mode === value} aria-controls={`${value}-panel`} tabIndex={mode === value ? 0 : -1}
            onClick={() => changeMode(value)} onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'voice' : event.key === 'End' ? 'joystick' : mode === 'voice' ? 'joystick' : 'voice';
                changeMode(next);
                document.getElementById(`${next}-tab`)?.focus();
              }
            }}>{label}</button>)}
        </div>
      </header>
      <div className={`connection-status ${online ? 'is-online' : ''}`}>
        <Icon name={online ? 'ready-Ellipse' : 'offline-Ellipse'} size={6} className="status-dot" />
        <span role="status">{statusLabel}</span>
        {!online && <button type="button" className="text-button connection-action" onClick={() => settings.brokerUrl ? connect() : openSettings()} disabled={connection === 'connecting'}>{settings.brokerUrl ? 'เชื่อมต่อ' : 'ตั้งค่า'}</button>}
        <button type="button" className="icon-button connection-settings" onClick={openSettings} aria-label="เปิดการตั้งค่า" ref={settingsButton}><Icon name="ready-IconSettings" size={18} /></button>
      </div>
      {mode === 'joystick' ? <Joystick key={connection} unavailable={connectionLost || connection === 'connecting'} reconnecting={connection === 'connecting'}
        onReconnect={() => settings.brokerUrl ? connect() : openSettings()} /> : <main id="voice-panel" role="tabpanel" aria-labelledby="voice-tab" className={`main-content phase-${phase}`}>
        <div className="instruction" aria-live="polite">
          <h1>{heading}</h1>
          <p className="small muted">{subtitle}</p>
        </div>
        {phase === 'sent' ? <>
          <div className="receipt" role="status">
            <span className="receipt-icon"><Icon name="sent-IconCheck" size={32} /></span>
            <p className="receipt-command">{receipt?.text}</p>
            <p className="small muted">ส่งเข้าระบบแล้ว ยังไม่ยืนยันการทำงานของรถ</p>
          </div>
          <button type="button" className="button primary" onClick={newCommand}><Icon name="sent-IconMic" size={20} />สั่งงานอีกครั้ง</button>
        </> : phase === 'review' ? <>
          <div className="transcript-editor">
            <label htmlFor="review-command">ข้อความที่จะส่ง<Icon name="review-IconEdit" size={18} /></label>
            <textarea id="review-command" value={draft} onChange={event => editDraft(event.target.value)} maxLength={MAX_TEXT_LENGTH} rows={3} disabled={sending} />
          </div>
          {lowConfidence && <p className="notice" role="alert">เสียงยังไม่ชัด ลองพูดใหม่ หรือแก้ไขข้อความก่อนส่ง</p>}
          <button type="button" className="button primary" onClick={() => submit()} disabled={!online || !draft.trim() || sending || stopping || lowConfidence}>
            {!sending && <Icon name="review-IconArrow" size={20} />}{sending ? 'กำลังส่ง…' : 'ส่งคำสั่ง'}
          </button>
          {!online && <button type="button" className="text-button connect-reminder" onClick={openSettings}>เชื่อมต่อรถก่อนส่งคำสั่ง</button>}
          <button type="button" className="button secondary" onClick={speechAvailable ? startSpeech : newCommand} disabled={sending || stopping}>
            <Icon name="review-IconMic" size={20} />{speechAvailable ? 'พูดใหม่' : 'กลับไปพิมพ์คำสั่ง'}
          </button>
          <div className="flex-spacer" />
        </> : <>
          <div className="voice-control">
            <button type="button" className={`microphone ${listening ? 'is-listening' : ''} ${connectionLost || !speechAvailable || speechError?.code === 'not-allowed' ? 'is-unavailable' : ''}`}
              onClick={phase === 'listening' ? finishSpeech : connectionLost ? () => connect() : startSpeech} disabled={phase === 'processing' || sending || stopping}
              aria-label={phase === 'listening' ? 'จบการพูด' : connectionLost ? 'เชื่อมต่ออีกครั้ง' : 'เริ่มพูดคำสั่ง'} aria-pressed={listening}>
              <Icon name={listening ? 'listening-IconStop' : connectionLost ? 'offline-IconOffline' : !speechAvailable || speechError?.code === 'not-allowed' ? 'permission-IconShield' : 'ready-IconMic'} size={listening ? 32 : 40} />
            </button>
            <p className="voice-label">{phase === 'processing' ? 'รอข้อความสักครู่' : phase === 'listening' ? 'แตะเพื่อจบการพูด' : connectionLost ? 'เชื่อมต่อเพื่อเริ่มสั่งรถ' : !speechAvailable ? 'พิมพ์คำสั่งแทนการใช้เสียงได้' : 'แตะเพื่อเริ่มพูด'}</p>
            {listening ? <div className="waveform" aria-hidden="true">{[5, 9, 16, 24, 13, 8, 20, 28, 18, 10, 22, 14, 7].map((height, i) => <span key={i} style={{ '--bar-height': `${height}px`, '--bar-delay': `${i * -0.09}s` }} />)}</div>
              : <button type="button" className="text-button language-button" onClick={() => languageDialog.current.showModal()}>{LANGUAGES[language]} <span aria-hidden="true">·</span> เปลี่ยนภาษา</button>}
          </div>
          {(speechError || !speechAvailable) && <div className="notice speech-notice" role="alert">{speechError?.message || (window.isSecureContext ? 'เบราว์เซอร์นี้ไม่รองรับการถอดเสียง พิมพ์คำสั่งด้านล่างได้' : 'ใช้ HTTPS เพื่อเปิดไมโครโฟน หรือพิมพ์คำสั่งแทน')}</div>}
          <form className="composer" onSubmit={reviewTyped}>
            <div className="text-entry">
              <Icon name="ready-IconKeyboard" size={20} />
              <input ref={textInput} aria-label="พิมพ์คำสั่ง" placeholder={listening ? 'กำลังฟัง…' : 'หรือพิมพ์คำสั่งที่นี่'} value={listening ? interim : draft}
                onChange={event => editDraft(event.target.value)} readOnly={listening} maxLength={MAX_TEXT_LENGTH} enterKeyHint="next" autoComplete="off" />
            </div>
            {connectionLost && !draft.trim() ? <button type="button" className="button primary" onClick={() => connect()}><Icon name="offline-IconRetry" size={20} />เชื่อมต่ออีกครั้ง</button> : <button type="submit" className={`button ${draft.trim() && !listening ? 'primary' : 'secondary'}`} disabled={!draft.trim() || listening || sending || stopping}>
              {listening ? 'กำลังฟัง…' : draft.trim() ? 'ตรวจข้อความ' : 'ส่งคำสั่ง'}
            </button>}
          </form>
        </>}
        {sendError && <p className="notice" role="alert">{sendError}</p>}
        {connectionError && <p className="notice" role="alert">{connectionError} <button type="button" className="text-button" onClick={openSettings}>เปิดการตั้งค่า</button></p>}
        <section className="history" aria-labelledby="history-title">
          <h2 id="history-title">คำสั่งล่าสุด</h2>
          {history.length ? <ol>{history.map((item, i) => <li key={`${item.timestamp}-${i}`}>
            <span className="history-text" title={item.text}>{item.text}</span>
            <time dateTime={new Date(item.timestamp).toISOString()}>{new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(item.timestamp)}</time>
            <span className="sent-label"><Icon name="ready-IconCheck" size={12} />ส่งแล้ว</span>
          </li>)}</ol> : <p className="small muted empty-history">ยังไม่มีคำสั่งที่ส่ง</p>}
        </section>
      </main>}
    </>}
    {storageNotice && <p className="small muted storage-notice" role="status">{storageNotice}</p>}
    {(mode === 'voice' || settingsOpen) && <footer className="stop-footer">
      <button type="button" className="button danger" onClick={() => submit(true)} disabled={!online || stopping}>
        <Icon name="ready-IconStop" size={20} />{stopping ? 'กำลังส่งคำสั่งหยุด…' : 'หยุดรถ'}
      </button>
      <p className="small muted">{online ? 'ส่งคำสั่งหยุดทันที โดยไม่ต้องยืนยัน' : 'ต้องเชื่อมต่อก่อนส่งคำสั่งหยุด'}</p>
    </footer>}
    <dialog ref={languageDialog} className="language-dialog" aria-labelledby="language-title" onClick={event => { if (event.target === languageDialog.current) languageDialog.current.close(); }}>
      <h2 id="language-title">ภาษาที่ใช้พูด</h2>
      {Object.entries(LANGUAGES).map(([value, label]) => <button type="button" key={value} className="language-option" onClick={() => changeLanguage(value)} aria-pressed={language === value}>{label}{language === value && <Icon name="sent-IconCheck" size={32} />}</button>)}
      <button type="button" className="text-button" onClick={() => languageDialog.current.close()}>ยกเลิก</button>
    </dialog>
  </div>;
}
