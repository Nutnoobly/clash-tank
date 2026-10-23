import { useEffect, useRef } from 'react';
import { directionAt, JOYSTICK_LABELS } from '../lib/joystick.js';
import Icon from './Icon.jsx';

const artwork = Object.fromEntries(
  ['neutral', 'forward', 'left', 'right', 'backward', 'offline'].map(state => [
    state, new URL(`../assets/controller/${state}.svg`, import.meta.url).href,
  ]),
);
const KEY_DIRECTIONS = { ArrowUp: 'forward', ArrowDown: 'backward', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'neutral', Home: 'neutral' };

export default function Joystick({ direction, onDirectionChange, unavailable, reconnecting, error }) {
  const pointer = useRef(null);
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const pad = useRef(null);
  const selected = unavailable ? 'neutral' : direction;

  useEffect(() => {
    function reset() {
      pointer.current = null;
      onDirectionChange('neutral');
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
  }, [onDirectionChange]);

  function choose(value, force = false) {
    if (unavailable || (!force && value === directionRef.current)) return;
    directionRef.current = value;
    onDirectionChange(value);
  }

  function chooseAt(event, force = false) {
    choose(directionAt(event.clientX, event.clientY, pad.current.getBoundingClientRect()), force);
  }

  function begin(event) {
    if (unavailable || pointer.current !== null || !event.isPrimary || event.button !== 0) return;
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    chooseAt(event, true);
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
    onDirectionChange('neutral');
  }

  return <main id="joystick-panel" role="tabpanel" aria-labelledby="joystick-tab" className="joystick-content">
    <div className="instruction">
      <h1>ควบคุมด้วยจอย</h1>
    </div>
    <div className={`joystick-command ${unavailable ? 'is-unavailable' : selected !== 'neutral' ? 'is-moving' : ''}`}>
      <p className="small muted">{unavailable ? (reconnecting ? 'กำลังเชื่อมต่อ' : 'ขาดการเชื่อมต่อ') : 'คำสั่งที่เลือก'}</p>
      <p className="joystick-command-label" role="status" aria-live="polite" aria-atomic="true">
        {unavailable ? 'หยุด · รอเชื่อมต่อใหม่' : JOYSTICK_LABELS[selected]}
      </p>
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
    <div className="joystick-reach-space" />
    <div className="joystick-pad" ref={pad} role="group" aria-label="จอยเลือกทิศทาง"
      onPointerDown={begin}
      onPointerMove={event => { if (!unavailable && pointer.current === event.pointerId) chooseAt(event); }}
      onPointerUp={release} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (!unavailable && KEY_DIRECTIONS[event.key]) {
          event.preventDefault();
          choose(KEY_DIRECTIONS[event.key], true);
        }
      }}>
      {Object.entries(artwork).map(([state, src]) => <img key={state} src={src} width="351" height="351" alt="" aria-hidden="true" draggable="false"
        className={`joystick-art ${state === (unavailable ? 'offline' : selected) ? 'is-visible' : ''}`} />)}
      {Object.entries(JOYSTICK_LABELS).map(([state, label]) => <button key={state} type="button" className={`joystick-hit hit-${state}`}
        aria-label={state === 'neutral' ? 'หยุด · กลับกลางจอย' : label} aria-pressed={selected === state} disabled={unavailable}
        onClick={event => {
          // Pointer gestures are handled by the pad; clicks from keyboard/AT select a button.
          if (event.detail === 0) choose(state, true);
        }} />)}
    </div>
    <div className="combat-actions" role="group" aria-label="โจมตีและป้องกัน — ยังไม่รองรับการสั่งจากจอย">
      <button type="button" className="combat-button attack" disabled title="รถยังไม่รองรับคำสั่งโจมตีจากจอย">
        <Icon name="combat-IconAttack" size={22} />โจมตี
      </button>
      <button type="button" className="combat-button defense" disabled title="รถยังไม่รองรับคำสั่งป้องกันจากจอย">
        <Icon name="combat-IconDefense" size={22} />ป้องกัน
      </button>
    </div>
  </main>;
}
