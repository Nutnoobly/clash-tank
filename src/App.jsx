import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import Settings from './components/Settings.jsx';
import Joystick from './components/Joystick.jsx';
import ConnectionGate from './components/ConnectionGate.jsx';
import { createTransport } from './lib/transport.js';
import { createVehicleControl } from './lib/vehicle.js';
import { createSpeechSession } from './lib/speech.js';
import { MAX_TEXT_LENGTH } from './lib/commands.js';
import { loadSettings, loadHistory, loadLanguage, saveSettings, writeStored, STORAGE_KEYS } from './lib/storage.js';

const LANGUAGES = { 'th-TH': 'ภาษาไทย', 'en-US': 'English' };

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...loadSettings(), password: '' }));
  const [history, setHistory] = useState(loadHistory);
  const [language, setLanguage] = useState(loadLanguage);
  const [connection, setConnection] = useState('connecting');
  const [connectionError, setConnectionError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState('voice');
  const [joystickDirection, setJoystickDirection] = useState('neutral');
  const [phase, setPhase] = useState('ready');
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [interim, setInterim] = useState('');
  const [confidence, setConfidence] = useState(undefined);
  const [speechError, setSpeechError] = useState(null);
  const [sendError, setSendError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const transport = useRef(null);
  const vehicle = useRef(null);
  const modeRef = useRef('voice');
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
  const connectLatest = useRef(null);
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

  const stopVehicle = useCallback(() => {
    setJoystickDirection('neutral');
    vehicle.current?.stop().catch(() => {});
  }, []);

  const selectDirection = useCallback(value => {
    setJoystickDirection(value);
    setSendError('');
    vehicle.current?.move(value).catch(error => {
      if (mounted.current) { setJoystickDirection('neutral'); setSendError(error.message); }
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sendGeneration.current += 1;
      connectionGeneration.current += 1;
      vehicle.current?.dispose();
      transport.current?.close();
      speech.current?.abort();
    };
  }, []);

  // Reuse saved settings, but never replay a command or restore a moving direction.
  connectLatest.current = connect;
  useEffect(() => {
    connectLatest.current();
    const resume = () => connectLatest.current();
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, []);
  useEffect(() => {
    if (!['offline', 'error', 'disconnected'].includes(connection)) return;
    const retry = setTimeout(() => connectLatest.current(), 2500);
    return () => clearTimeout(retry);
  }, [connection]);

  useEffect(() => {
    function suspend() {
      if (!document.hidden) return;
      stopVehicle();
      sendGeneration.current += 1;
      speech.current?.abort();
      speech.current = null;
      setPhase(current => ['listening', 'processing'].includes(current) ? 'ready' : current);
      setInterim('');
    }
    function offline() {
      stopVehicle();
      connectionGeneration.current += 1;
      transport.current?.close();
      setConnection('offline');
      setConnectionError('อินเทอร์เน็ตขาด เชื่อมต่อใหม่เมื่อพร้อม');
      abortSpeech();
      setPhase(current => ['listening', 'processing'].includes(current) ? 'ready' : current);
    }
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('pagehide', stopVehicle);
    window.addEventListener('offline', offline);
    return () => {
      document.removeEventListener('visibilitychange', suspend);
      window.removeEventListener('pagehide', stopVehicle);
      window.removeEventListener('offline', offline);
    };
  }, [abortSpeech, stopVehicle]);

  useEffect(() => {
    if (!writeStored(STORAGE_KEYS.history, history)) {
      setStorageNotice('เบราว์เซอร์บันทึกข้อมูลไม่ได้ ประวัติจะอยู่เฉพาะครั้งนี้');
    }
  }, [history]);

  function persist(key, value) {
    if (!writeStored(key, value)) setStorageNotice('เบราว์เซอร์บันทึกข้อมูลไม่ได้ การตั้งค่าและประวัติจะอยู่เฉพาะครั้งนี้');
  }

  function openSettings() {
    stopVehicle();
    sendGeneration.current += 1;
    abortSpeech();
    if (listening) setPhase('ready');
    setSettingsOpen(true);
  }

  async function connect(value = settings) {
    const generation = ++connectionGeneration.current;
    vehicle.current?.dispose();
    setJoystickDirection('neutral');
    transport.current?.close();
    setSettings(value);
    if (!saveSettings(value)) setStorageNotice('บันทึกการตั้งค่าไม่ได้ แต่ยังเชื่อมต่อได้ตามปกติ');
    setSettingsOpen(false);
    setSendError('');
    setConnection('connecting');
    setConnectionError('');
    try {
      // Load the MQTT client when opening the app or retrying a failed connection.
      const { default: mqtt } = await import('mqtt');
      if (!mounted.current || generation !== connectionGeneration.current) return;
      const current = createTransport(mqtt.connect, (state, error) => {
        if (!mounted.current || generation !== connectionGeneration.current) return;
        setConnection(state);
        setConnectionError(error);
        if (state === 'connected') vehicle.current?.setMode(modeRef.current).catch(() => {});
        else {
          vehicle.current?.dispose();
          setJoystickDirection('neutral');
          sendGeneration.current += 1;
          abortSpeech();
          languageDialog.current?.close();
          setPhase(current => ['listening', 'processing'].includes(current) ? 'ready' : current);
        }
      });
      transport.current = current;
      vehicle.current = createVehicleControl(current, error => {
        if (!mounted.current || generation !== connectionGeneration.current) return;
        setJoystickDirection('neutral');
        setSendError(error.message);
      });
      current.open(value);
    } catch {
      if (!mounted.current || generation !== connectionGeneration.current) return;
      setConnection('error');
      setConnectionError('โหลดตัวเชื่อมต่อไม่ได้ ลองรีเฟรชหน้าเว็บแล้วเชื่อมต่ออีกครั้ง');
    }
  }

  function changeMode(value) {
    if (value === mode) return;
    abortSpeech();
    stopVehicle();
    modeRef.current = value;
    if (online) vehicle.current?.setMode(value).catch(() => {});
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
        if (score !== undefined && score < 0.5) setPhase('review');
        else { setPhase('ready'); submit(false, { text: value, confidence: score }); }
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
      submit();
    }
  }

  async function submit(stop = false, recognized) {
    const commandText = recognized?.text ?? draft;
    const commandConfidence = recognized ? recognized.confidence : confidence;
    if (!online || (stop ? stoppingRef.current : sendingRef.current || stoppingRef.current)) return;
    if (!stop && (!commandText.trim() || (!recognized && listening) || (commandConfidence !== undefined && commandConfidence < 0.5))) return;
    const generation = ++sendGeneration.current;
    if (stop) { stoppingRef.current = true; setStopping(true); abortSpeech(); setPhase('ready'); }
    else { sendingRef.current = true; setSending(true); }
    setSendError('');
    try {
      const payload = await (stop ? vehicle.current.stop(true) : vehicle.current.sendVoice(commandText, commandConfidence));
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
    setTyping(false);
    setSpeechError(null);
    setSendError('');
    setReceipt(null);
  }

  function changeLanguage(value) {
    setLanguage(value);
    persist(STORAGE_KEYS.language, value);
    languageDialog.current.close();
  }

  const heading = sending ? 'กำลังส่งคำสั่ง…' : phase === 'sent' ? (receipt?.stop ? 'ส่งคำสั่งหยุดแล้ว' : 'ส่งคำสั่งแล้ว')
    : phase === 'review' ? 'ตรวจคำสั่งก่อนส่ง' : phase === 'listening' ? 'กำลังฟังคุณ…'
    : phase === 'processing' ? 'กำลังถอดเสียง…' : speechError?.code === 'not-allowed' ? 'เปิดใช้ไมโครโฟน'
    : connectionLost ? 'ยังสั่งรถไม่ได้' : 'สั่งรถด้วยเสียง';
  const lowConfidence = confidence !== undefined && confidence < 0.5;
  const statusLabel = ({ connected: 'เชื่อมต่อแล้ว', connecting: 'กำลังเชื่อมต่อ…', offline: 'การเชื่อมต่อขาด', error: 'เชื่อมต่อไม่สำเร็จ', disconnected: 'ยังไม่ได้เชื่อมต่อ' })[connection];

  return <div className={`app-shell ${mode === 'joystick' && !settingsOpen ? 'joystick-mode' : ''}`}>
    {settingsOpen ? <Settings settings={settings} connection={connection} onConnect={connect}
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
        <button type="button" className="icon-button connection-settings" onClick={openSettings} aria-label="เปิดการตั้งค่า" ref={settingsButton}><Icon name="ready-IconSettings" size={18} /></button>
      </div>
      {mode === 'joystick' ? <Joystick key={connection} direction={joystickDirection} onDirectionChange={selectDirection}
        unavailable={!online} reconnecting={connection === 'connecting'} error={sendError} /> : <main id="voice-panel" role="tabpanel" aria-labelledby="voice-tab" className={`main-content phase-${phase}`}>
        <div className="instruction" aria-live="polite">
          <h1>{heading}</h1>
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
          <button type="button" className="button secondary" onClick={speechAvailable ? startSpeech : newCommand} disabled={sending || stopping}>
            <Icon name="review-IconMic" size={20} />{speechAvailable ? 'พูดใหม่' : 'กลับไปพิมพ์คำสั่ง'}
          </button>
          <div className="flex-spacer" />
        </> : <>
          <div className="voice-control">
            <button type="button" className={`microphone ${listening ? 'is-listening' : ''} ${connectionLost || !speechAvailable || speechError?.code === 'not-allowed' ? 'is-unavailable' : ''}`}
              onClick={phase === 'listening' ? finishSpeech : startSpeech} disabled={!online || phase === 'processing' || sending || stopping}
              aria-label={phase === 'listening' ? 'จบการพูด' : 'เริ่มพูดคำสั่ง'} aria-pressed={listening}>
              <Icon name={listening ? 'listening-IconStop' : !speechAvailable || speechError?.code === 'not-allowed' ? 'permission-IconShield' : 'neumorphic-IconMic'} size={listening ? 32 : 40} />
            </button>
            <p className="voice-label">{phase === 'processing' ? 'รอข้อความสักครู่' : phase === 'listening' ? 'แตะเพื่อจบการพูด' : connectionLost ? 'เชื่อมต่อเพื่อเริ่มสั่งรถ' : !speechAvailable ? 'พิมพ์คำสั่งแทนการใช้เสียงได้' : 'แตะเพื่อเริ่มพูด'}</p>
            {listening ? <div className="waveform" aria-hidden="true">{[5, 9, 16, 24, 13, 8, 20, 28, 18, 10, 22, 14, 7].map((height, i) => <span key={i} style={{ '--bar-height': `${height}px`, '--bar-delay': `${i * -0.09}s` }} />)}</div>
              : <button type="button" className="text-button language-button" onClick={() => languageDialog.current.showModal()}>{LANGUAGES[language]} <span aria-hidden="true">·</span> เปลี่ยนภาษา</button>}
          </div>
          {(speechError || !speechAvailable) && <div className="notice speech-notice" role="alert">{speechError?.message || (window.isSecureContext ? 'เบราว์เซอร์นี้ไม่รองรับการถอดเสียง พิมพ์คำสั่งด้านล่างได้' : 'ใช้ HTTPS เพื่อเปิดไมโครโฟน หรือพิมพ์คำสั่งแทน')}</div>}
          {typing ? <form className="composer" onSubmit={reviewTyped}>
            <div className="text-entry">
              <Icon name="ready-IconKeyboard" size={20} />
              <input ref={textInput} aria-label="พิมพ์คำสั่ง" placeholder={listening ? 'กำลังฟัง…' : 'หรือพิมพ์คำสั่งที่นี่'} value={listening ? interim : draft}
                onChange={event => editDraft(event.target.value)} readOnly={listening} maxLength={MAX_TEXT_LENGTH} enterKeyHint="send" autoComplete="off" />
            </div>
            <button type="submit" className={`button ${draft.trim() && !listening ? 'primary' : 'secondary'}`} disabled={!online || !draft.trim() || listening || sending || stopping}>
              {sending ? 'กำลังส่ง…' : listening ? 'กำลังฟัง…' : 'ส่งคำสั่ง'}
            </button>
          </form> : <button type="button" className="text-button type-shortcut" disabled={listening || sending || stopping}
            onClick={() => { setTyping(true); requestAnimationFrame(() => textInput.current?.focus()); }}>
            <Icon name="ready-IconKeyboard" size={16} />พิมพ์คำสั่ง
          </button>}
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
    </footer>}
    <dialog ref={languageDialog} className="language-dialog" aria-labelledby="language-title" onClick={event => { if (event.target === languageDialog.current) languageDialog.current.close(); }}>
      <h2 id="language-title">ภาษาที่ใช้พูด</h2>
      {Object.entries(LANGUAGES).map(([value, label]) => <button type="button" key={value} className="language-option" onClick={() => changeLanguage(value)} aria-pressed={language === value}>{label}{language === value && <Icon name="sent-IconCheck" size={32} />}</button>)}
      <button type="button" className="text-button" onClick={() => languageDialog.current.close()}>ยกเลิก</button>
    </dialog>
    <ConnectionGate blocked={!online} />
  </div>;
}
