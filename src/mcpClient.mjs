import { spawn } from 'node:child_process';

// 公式 @kaitoinfra/twitterapi-io-mcp-server を子プロセスで起動し、
// JSON-RPC(改行区切り = MCP stdio transport)で会話する最小クライアント。
// REST を自前実装せず既存 MCP を再利用するのが狙い(キャッシュ層に専念し車輪を再発明しない)。
export class McpClient {
  constructor({ apiKey, pkg = '@kaitoinfra/twitterapi-io-mcp-server@0.1.2' }) {
    if (!apiKey) throw new Error('API キーが未設定(TWITTERAPI_IO_API_KEY / TWITTERAPI_API_KEY)');
    // shell:true は Windows で npx(=npx.cmd) を解決するため。引数は固定値のみで外部入力を含めない。
    this.child = spawn('npx', ['-y', pkg], {
      env: { ...process.env, TWITTERAPI_IO_API_KEY: apiKey },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    this.buf = '';
    this.pending = new Map();
    this.nextId = 1;
    this.child.stdout.on('data', (d) => this._onData(d));
    this.child.stderr.on('data', () => {}); // サーバの起動ログ(stderr)は読み捨て
    // npx 解決失敗(ENOENT)やサーバ即死に備える。未処理だと error イベントは throw され
    // collect() の catch でも拾えずプロセスごと落ちる。さらに待機中の RPC を reject しないと
    // 30 秒のタイムアウトまでハングするので、ここで全て失敗させる。
    this.child.on('error', (e) => this._failAll(e));
    this.child.on('exit', (code, signal) => {
      if (this.pending.size > 0) this._failAll(new Error(`MCP server exited (code=${code}, signal=${signal})`));
    });
  }

  _failAll(err) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }

  _onData(chunk) {
    this.buf += chunk.toString();
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        resolve(msg);
      }
    }
  }

  _rpc(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout: ' + method)); }
      }, 30000);
      timer.unref?.(); // タイマーがプロセスの終了を妨げないように
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  _notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async init() {
    await this._rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'x-collect', version: '0.1.0' },
    });
    this._notify('notifications/initialized', {});
  }

  // tools/call の結果は content[0].text に JSON 文字列で入るのでパースして返す。
  async callTool(name, args) {
    const res = await this._rpc('tools/call', { name, arguments: args });
    if (res.error) throw new Error(`${name} RPC error: ${JSON.stringify(res.error)}`);
    const text = res.result?.content?.[0]?.text;
    if (text == null) throw new Error(`${name}: 空応答`);
    // ツールがエラー時は isError=true ＋ プレーン文字列(=非JSON)を返すことがある。
    if (res.result?.isError) throw new Error(`${name} tool error: ${text}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${name}: 応答が JSON でない: ${text.slice(0, 200)}`);
    }
  }

  close() {
    try { this.child.stdin.end(); this.child.kill(); } catch { /* noop */ }
  }
}
