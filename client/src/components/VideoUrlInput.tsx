// VideoUrlInput: paste a YouTube URL/ID -> parseYouTubeId -> Host/Mod emit 'change_video', Participant sends a 'request change'.
// Invalid input shows an inline error. The server validates again.
import { useState } from 'react';
import { parseYouTubeId } from '@watchparty/shared';
import { actions } from '../lib/actions';
import { selectCanControl, useRoomStore } from '../store/roomStore';

export default function VideoUrlInput() {
  const canControl = useRoomStore(selectCanControl);
  const pending = useRoomStore((s) => s.myRequests.some((r) => r.type === 'change_video'));
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function submit() {
    const videoId = parseYouTubeId(value);
    if (!videoId) {
      setError('This is not a valid YouTube link or video ID.');
      return;
    }
    setError('');
    if (canControl) actions.changeVideo(videoId);
    else actions.requestAction({ type: 'change_video', payload: { videoId } });
    setValue('');
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          aria-label="YouTube URL"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Paste YouTube link or video ID"
          className="input min-w-0 flex-1"
        />
        <button
          onClick={submit}
          disabled={!value.trim() || (!canControl && pending)}
          className="btn btn-primary shrink-0"
        >
          {canControl ? 'Change video' : pending ? 'Pending...' : 'Request change'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
