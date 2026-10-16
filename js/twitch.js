// Browser-only Twitch chat client (IRC over WebSocket). No server needed.
// Anonymous (justinfan) = read only. With a token it can also post messages.
import { chatMessage } from './core.js';

export class TwitchChat {
  constructor({ channel, login, token, onMessage, onStatus }) {
    this.channel = String(channel || '').replace(/^#/, '').toLowerCase();
    this.login = (login || '').toLowerCase(); this.token = (token || '').replace(/^oauth:/, '');
    this.onMessage = onMessage || (() => {}); this.onStatus = onStatus || (() => {});
    this.closed = false; this.retry = 0;
  }
  get canPost() { return !!(this.token && this.login); }
  connect() {
    if (!this.channel) { this.onStatus('no channel set'); return; }
    this.closed = false;
    const ws = (this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'));
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      if (this.canPost) { ws.send(`PASS oauth:${this.token}`); ws.send(`NICK ${this.login}`); }
      else { ws.send('PASS SCHMOOPIIE'); ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`); }
      ws.send(`JOIN #${this.channel}`);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split('\r\n').filter(Boolean)) {
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        if (line.includes(' JOIN #')) { this.retry = 0; this.onStatus(this.canPost ? 'connected (can post)' : 'connected (read-only)'); }
        if (line.includes('Login authentication failed')) this.onStatus('token rejected - re-authorize in dashboard');
        const m = chatMessage(line); if (m) this.onMessage(m);
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.onStatus('reconnecting...');
      setTimeout(() => this.connect(), Math.min(30000, 1000 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }
  say(text) { if (this.canPost && this.ws?.readyState === 1) this.ws.send(`PRIVMSG #${this.channel} :${text}`); }
  close() { this.closed = true; this.ws?.close(); }
}

// Optional: trigger a Streamer.bot action (runs on the streamer's own PC).
// Needs Streamer.bot's WebSocket Server started. See README.
export class StreamerBot {
  constructor(url, actionName) { this.url = url; this.actionName = actionName; this.ws = null; }
  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onclose = () => setTimeout(() => this.connect(), 5000);
      this.ws.onerror = () => this.ws.close();
    } catch { /* ignore */ }
  }
  say(message) {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(JSON.stringify({ request: 'DoAction', id: String(Date.now()), action: { name: this.actionName }, args: { message } }));
  }
}
