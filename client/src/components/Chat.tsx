// Chat: message list + input + auto-scroll. Text is always rendered as a React text node (XSS-safe); dangerouslySetInnerHTML is never used.
import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH } from '@watchparty/shared';
import { actions } from '../lib/actions';
import { useRoomStore } from '../store/roomStore';

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Chat() {
  const chat = useRoomStore((s) => s.chat);
  const meId = useRoomStore((s) => s.me?.userId);
  const markRead = useRoomStore((s) => s.markChatRead);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // The tab is open: mark new messages as read right away and scroll to the bottom.
  useEffect(() => {
    markRead();
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [chat.length, markRead]);

  function send() {
    const t = text.trim();
    if (!t) return;
    actions.chat(t); // server errors (RATE_LIMITED etc.) become toasts
    setText('');
  }

  return (
    <section aria-label="Chat" className="card flex h-80 flex-col lg:h-[28rem]">
      <ul data-testid="chat-list" className="flex-1 space-y-2 overflow-y-auto p-3">
        {chat.length === 0 && <li className="py-8 text-center text-sm text-slate-400">No messages yet. Send the first one!</li>}
        {chat.map((m) => {
          const mine = m.userId === meId;
          return (
            <li key={m.id} data-testid="chat-message" className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="text-[11px] text-slate-500">
                {mine ? 'You' : m.username} · {time(m.ts)}
              </span>
              <span className={`max-w-[85%] whitespace-pre-wrap break-words px-3.5 py-2 text-sm ${mine ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white' : 'rounded-2xl rounded-bl-md bg-slate-100 text-slate-900'}`}>
                {m.text}
              </span>
            </li>
          );
        })}
        <div ref={endRef} />
      </ul>
      <div className="flex gap-2 border-t border-slate-100 p-2">
        <input
          aria-label="Chat message"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Message..."
          className="input min-w-0 flex-1"
        />
        <button onClick={send} disabled={!text.trim()} className="btn btn-primary shrink-0">
          Send
        </button>
      </div>
    </section>
  );
}
