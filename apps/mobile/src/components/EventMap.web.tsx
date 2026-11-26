import { useEffect, useMemo, useRef, useState } from 'react';
import { mapDocument, MapProps, parseMapPoint } from './mapDocument';
export function EventMap({ point, editable = false, onChange }: MapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [initial] = useState(point);
  const html = useMemo(() => mapDocument(initial, editable), [initial, editable]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      const value = parseMapPoint(event.data);
      if (editable && value) onChange?.(value);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [editable, onChange]);
  return (
    <iframe
      ref={frame}
      title={editable ? 'Выбрать место события' : 'Место события'}
      srcDoc={html}
      style={{
        width: '100%',
        height: editable ? '100%' : 280,
        flex: editable ? 1 : undefined,
        border: 0,
        borderRadius: 16,
      }}
    />
  );
}
