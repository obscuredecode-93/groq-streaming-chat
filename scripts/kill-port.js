const { execSync } = require('child_process');
const PORT = process.env.PORT || 3000;

try {
  const out = execSync('netstat -ano', { encoding: 'utf8' });
  const pids = new Set();

  out.split('\n').forEach((line) => {
    if (!line.includes(`:${PORT}`)) return;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  });

  pids.forEach((pid) => {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[predev] Killed PID ${pid} on port ${PORT}`);
    } catch (_) {}
  });
} catch (_) {}
