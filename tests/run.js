// 一键启动 mock server + 跑 e2e，结束后自动清理
const { spawn } = require('child_process');
const path = require('path');

const server = spawn(process.execPath, [path.join(__dirname, 'mock-server.js')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '8080' }
});

let ready = false;
server.stdout.on('data', chunk => {
  process.stdout.write(chunk);
  if (String(chunk).includes('ready')) ready = true;
});
server.stderr.on('data', chunk => process.stderr.write(chunk));

function waitReady(ms = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (ready) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(timer);
        reject(new Error('mock server 启动超时'));
      }
    }, 50);
  });
}

(async () => {
  try {
    await waitReady();
    const code = await new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(__dirname, 'e2e.js')], {
        stdio: 'inherit',
        env: process.env
      });
      child.on('exit', resolve);
    });
    server.kill('SIGTERM');
    process.exit(code || 0);
  } catch (error) {
    console.error(error);
    server.kill('SIGTERM');
    process.exit(1);
  }
})();
