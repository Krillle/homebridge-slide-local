// slide-client.js
const crypto = require('crypto');

class SlideClient {
  /**
   * @param {string} host - IP or hostname of the Slide device.
   * @param {{ timeout?: number, username?: string, password?: string }} options
   */
  constructor(host, options = {}) {
    this.host = host;
    this.timeout = options.timeout || 5000;
    this.username = options.username || null;
    this.password = options.password || null;
  }

  /**
   * Haupt-RPC-Request gegen die Slide-Local-API (POST, JSON, optional Digest)
   * @param {string} path z.B. "/rpc/Slide.GetInfo"
   * @param {object} body
   * @returns {Promise<any>}
   */
  async rpc(path, body = {}) {
    const url = `http://${this.host}${path}`;
    const payload = JSON.stringify(body || {});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    // Helper zum Ausführen eines POST-Requests mit optionalen Zusatz-Headern
    const doRequest = async (extraHeaders = {}) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: payload,
        signal: controller.signal,
      });
      return res;
    };

    try {
      // Fall 1: keine Auth konfiguriert → einfacher POST
      if (!this.username || !this.password) {
        const res = await doRequest();
        if (!res.ok) {
          throw new Error(`Slide RPC ${path} failed with status ${res.status}`);
        }
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text);
      }

      // Fall 2: Digest Auth nötig
      // Schritt 1: Request ohne Auth, um WWW-Authenticate zu bekommen
      let res = await doRequest();

      if (res.status === 401) {
        const wwwAuth = res.headers.get('www-authenticate');
        if (!wwwAuth) {
          throw new Error(`401 from Slide but no WWW-Authenticate header (${this.host}${path})`);
        }

        const authHeader = this.buildDigestAuthHeader(wwwAuth, {
          method: 'POST',
          uri: path,
          username: this.username,
          password: this.password,
        });

        // Schritt 2: Request mit Digest Authorization
        res = await doRequest({ Authorization: authHeader });
      }

      if (!res.ok) {
        throw new Error(`Slide RPC ${path} failed with status ${res.status}`);
      }

      const text = await res.text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Slide RPC ${path} timed out`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Digest-Header basierend auf WWW-Authenticate generieren.
   * Unterstützt qop="auth" und MD5 (typischer Slide-Case).
   */
  buildDigestAuthHeader(wwwAuthHeader, { method, uri, username, password }) {
    const challenge = this.parseDigestChallenge(wwwAuthHeader);

    const realm = challenge.realm;
    const nonce = challenge.nonce;
    const qop = challenge.qop || 'auth';
    const opaque = challenge.opaque;

    const cnonce = crypto.randomBytes(8).toString('hex');
    const nc = '00000001';

    const ha1 = crypto
      .createHash('md5')
      .update(`${username}:${realm}:${password}`)
      .digest('hex');

    const ha2 = crypto
      .createHash('md5')
      .update(`${method}:${uri}`)
      .digest('hex');

    const response = crypto
      .createHash('md5')
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');

    let header =
      `Digest username="${username}", realm="${realm}", ` +
      `nonce="${nonce}", uri="${uri}", ` +
      `response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

    if (opaque) {
      header += `, opaque="${opaque}"`;
    }

    return header;
  }

  /**
   * WWW-Authenticate-Header in Key/Value-Objekt parsen
   */
  parseDigestChallenge(header) {
    // Beispiel:
    // Digest realm="slide", qop="auth", nonce="xxx", opaque="yyy"
    const prefix = 'Digest ';
    const s = header.startsWith(prefix) ? header.slice(prefix.length) : header;

    const result = {};
    const regex = /(\w+)=("([^"]+)"|([^,]+))/g;
    let match;
    while ((match = regex.exec(s)) !== null) {
      const key = match[1];
      const value = match[3] || match[4];
      result[key] = value;
    }
    return result;
  }

  // Convenience-Methoden

  async getInfo() {
    return this.rpc('/rpc/Slide.GetInfo', {});
  }

  /**
   * pos: 0 = vollständig offen, 1 = vollständig geschlossen
   */
  async setPosition(pos) {
    const clamped = Math.max(0, Math.min(1, pos));
    return this.rpc('/rpc/Slide.SetPos', { pos: clamped });
  }

  async stop() {
    return this.rpc('/rpc/Slide.Stop', {});
  }

  async calibrate() {
    return this.rpc('/rpc/Slide.Calibrate', {});
  }
}

module.exports = { SlideClient };
