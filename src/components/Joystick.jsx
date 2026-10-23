import { useEffect, useRef, useState } from 'react';
import { directionAt, JOYSTICK_LABELS } from '../lib/joystick.js';

const artwork = Object.fromEntries(
  ['neutral', 'forward', 'left', 'right', 'backward', 'offline'].map(state => [
    state, new URL(`../assets/controller/${state}.svg`, import.meta.url).href,
  ]),
);
const KEY_DIRECTIONS = { ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'neutral', Home: 'neutral' };

export default function Joystick({ unavailable, reconnecting, onReconnect }) {
  const [direction, setDirection] = useState('neutral');
  const pointer = useRef(null);
  const pad = useRef(null);
  const selected = unavailable ? 'neutral' : direction;

  useEffect(() => {
    function reset() {
      pointer.current = null;
      setDirection('neutral');
    }
    function suspend() { if (document.hidden) reset(); }
    document.addEventListener('visibilitychange', suspend);
    window.addEventListener('pagehide', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('offline', reset);
    return () => {
      document.removeEventListener('visibilitychange', suspend);
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('offline', reset);
    };
  }, []);

  function chooseAt(event) {
    setDirection(directionAt(event.clientX, event.clientY, pad.current.getBoundingClientRect()));
  }

  function begin(event) {
    if (unavailable || pointer.current !== null || !event.isPrimary || event.button !== 0) return;
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    chooseAt(event);
  }

  function release(event) {
    if (pointer.current !== event.pointerId) return;
    // Release ends the gesture; the last selected direction stays latched.
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function cancel(event) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setDirection('neutral');
  }

  return <main id="joystick-panel" role="tabpanel" aria-labelledby="joystick-tab" className="joystick-content">
    <div className="instruction">
      <h1>ควบคุมด้วยจอย</h1>
      <p className="small muted">แตะหรือลากเพื่อเลือกทิศทาง</p>
    </div>
    <div className={`joystick-command ${unavailable ? 'is-unavailable' : selected !== 'neutral' ? 'is-moving' : ''}`}>
      <p className="small muted">{unavailable ? (reconnecting ? 'กำลังเชื่อมต่อ' : 'ขาดการเชื่อมต่อ') : 'คำสั่งที่เลือก'}</p>
      <p className="joystick-command-label" role="status" aria-live="polite" aria-atomic="true">
        {unavailable ? 'หยุด · รอเชื่อมต่อใหม่' : JOYSTICK_LABELS[selected]}
      </p>
      <p className="small muted joystick-preview">ตัวอย่าง UI · ยังไม่ส่งคำสั่งไปยังรถ</p>
    </div>
    <div className="joystick-reach-space" />
    <div className="joystick-pad" ref={pad} role="group" aria-label="จอยเลือกทิศทาง" aria-describedby="joystick-hint"
      onPointerDown={begin}
      onPointerMove={event => { if (!unavailable && pointer.current === event.pointerId) chooseAt(event); }}
      onPointerUp={release} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (!unavailable && KEY_DIRECTIONS[event.key]) {
          event.preventDefault();
          setDirection(KEY_DIRECTIONS[event.key]);
        }
      }}>
      {Object.entries(artwork).map(([state, src]) => <img key={state} src={src} width="352" height="352" alt="" aria-hidden="true" draggable="false"
        className={`joystick-art ${state === (unavailable ? 'offline' : selected) ? 'is-visible' : ''}`} />)}
      {Object.entries(JOYSTICK_LABELS).map(([state, label]) => <button key={state} type="button" className={`joystick-hit hit-${state}`}
        aria-label={state === 'neutral' ? 'หยุด · กลับกลางจอย' : label} aria-pressed={selected === state} disabled={unavailable}
        onClick={event => {
          // Pointer gestures are handled by the pad; clicks from keyboard/AT select a button.
          if (event.detail === 0) setDirection(state);
        }} />)}
    </div>
    <div id="joystick-hint" className="joystick-hint">
      {unavailable ? <>
        <button type="button" className="button secondary" onClick={onReconnect} disabled={reconnecting}>{reconnecting ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อใหม่'}</button>
        <p className="small muted">เชื่อมต่อแล้วเลือกทิศทางใหม่</p>
      </> : <>
        <p>แตะกลางเพื่อหยุด</p>
        <p className="small muted">ปล่อยนิ้วแล้วจอยจะค้างตำแหน่งเดิม</p>
        <p className="small muted">ซ้าย / ขวา คือหมุนอยู่กับที่</p>
      </>}
    </div>
  </main>;
}
