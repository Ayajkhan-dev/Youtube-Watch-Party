// YouTube IFrame API script ek hi baar load hota hai (singleton promise). window.YT pehle se ho to turant resolve.
let loading: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => {
      loading = null; // dobara try ho sake
      reject(new Error('Failed to load the YouTube API'));
    };
    document.head.appendChild(tag);
  });
  return loading;
}
