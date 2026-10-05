// Fake YouTube IFrame API (jsdom mein asli iframe nahi chalta). Player ke saare calls record hote hain.
export class FakePlayer {
  static instances: FakePlayer[] = [];
  calls: [string, ...unknown[]][] = [];
  state = -1;
  time = 0;
  loaded: string | null = null;
  constructor(
    public el: HTMLElement,
    public opts: { playerVars?: Record<string, unknown>; events?: { onReady?: (e: unknown) => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void } },
  ) {
    FakePlayer.instances.push(this);
    setTimeout(() => opts.events?.onReady?.({ target: this }), 0);
  }
  private rec(name: string, ...a: unknown[]) {
    this.calls.push([name, ...a]);
  }
  loadVideoById(a: { videoId: string; startSeconds: number }) {
    this.rec('loadVideoById', a);
    this.loaded = a.videoId;
    this.time = a.startSeconds;
    this.state = 1;
  }
  cueVideoById(a: { videoId: string; startSeconds: number }) {
    this.rec('cueVideoById', a);
    this.loaded = a.videoId;
    this.time = a.startSeconds;
    this.state = 5;
  }
  seekTo(t: number) {
    this.rec('seekTo', t);
    this.time = t;
  }
  playVideo() {
    this.rec('playVideo');
    this.state = 1;
  }
  pauseVideo() {
    this.rec('pauseVideo');
    this.state = 2;
  }
  getCurrentTime() {
    return this.time;
  }
  getPlayerState() {
    return this.state;
  }
  getDuration() {
    return 300;
  }
  setVolume(v: number) {
    this.rec('setVolume', v);
  }
  destroy() {
    this.rec('destroy');
  }
  names() {
    return this.calls.map((c) => c[0]);
  }
  last(name: string) {
    return [...this.calls].reverse().find((c) => c[0] === name);
  }
}

export function installFakeYT() {
  FakePlayer.instances = [];
  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer };
}
