import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

// A native modal makes the rest of the document inert, including keyboard focus.
export default function ConnectionGate({ blocked }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!blocked) { dialog.current.close(); return; }
    dialog.current.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; dialog.current?.close(); };
  }, [blocked]);
  return <dialog ref={dialog} className="connection-dialog" aria-labelledby="connection-title"
    aria-modal="true" onCancel={event => event.preventDefault()}>
    <Icon name="connection-progress" size={32} className="connection-spinner" />
    <h2 id="connection-title" tabIndex={-1} autoFocus role="status">กำลังเชื่อมต่อ</h2>
  </dialog>;
}
