export function speechErrorMessage(code) {
  return ({
    'not-allowed': 'ยังไม่ได้รับสิทธิ์ไมค์ อนุญาตไมโครโฟนในการตั้งค่าเว็บไซต์ หรือพิมพ์คำสั่งแทน',
    'service-not-allowed': 'เบราว์เซอร์ไม่อนุญาตบริการถอดเสียง ลองเปิดใน Safari หรือ Chrome โดยตรง',
    'audio-capture': 'ไม่พบไมโครโฟน ตรวจว่าไม่มีแอปอื่นใช้งานอยู่',
    'no-speech': 'ยังไม่ได้ยินเสียง ลองพูดอีกครั้ง หรือพิมพ์คำสั่ง',
    network: 'บริการถอดเสียงเชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่',
    'language-not-supported': 'บริการนี้ยังไม่รองรับภาษาที่เลือก ลองเปลี่ยนภาษาหรือพิมพ์คำสั่ง',
  })[code] || 'ถอดเสียงไม่สำเร็จ ลองใหม่หรือพิมพ์คำสั่งแทน';
}

export function createSpeechSession(Recognition, language, callbacks) {
  const recognition = new Recognition();
  recognition.lang = language;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  const finals = new Map();
  let active = true;
  let failed = false;
  let finishTimer;

  recognition.onresult = event => {
    if (!active) return;
    const interim = [];
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) finals.set(i, result[0]);
      else interim.push(result[0].transcript);
    }
    callbacks.onInterim([...finals.values()].map(item => item.transcript).concat(interim).join(' ').trim());
  };
  function complete() {
    if (!active) return;
    active = false;
    clearTimeout(finishTimer);
    if (failed) return;
    const items = [...finals.values()];
    const text = items.map(item => item.transcript).join(' ').trim();
    if (!text) { callbacks.onError('no-speech', speechErrorMessage('no-speech')); return; }
    // Some engines use zero to mean unavailable. Omit it rather than invent a score.
    const scores = items.map(item => item.confidence);
    const confidence = scores.every(score => Number.isFinite(score) && score > 0 && score <= 1)
      ? Math.min(...scores) : undefined;
    callbacks.onFinal(text, confidence);
  }
  recognition.onerror = event => {
    if (!active) return;
    failed = true;
    active = false;
    clearTimeout(finishTimer);
    callbacks.onError(event.error, speechErrorMessage(event.error));
  };
  recognition.onend = complete;
  return {
    start() {
      try { recognition.start(); } catch {
        active = false;
        callbacks.onError('start-failed', 'เริ่มฟังไม่ได้ ลองแตะไมค์อีกครั้ง');
      }
    },
    stop() {
      if (!active) return;
      finishTimer = setTimeout(() => { complete(); try { recognition.abort(); } catch { /* Already stopped. */ } }, 5000);
      try { recognition.stop(); } catch { complete(); }
    },
    abort() {
      active = false;
      clearTimeout(finishTimer);
      try { recognition.abort(); } catch { /* Already stopped. */ }
    },
  };
}
