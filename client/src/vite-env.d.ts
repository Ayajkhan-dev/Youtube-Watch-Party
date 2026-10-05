/// <reference types="vite/client" />

// YouTube IFrame API ye global function call karta hai jab script load ho jaati hai.
interface Window {
  onYouTubeIframeAPIReady?: () => void;
}
