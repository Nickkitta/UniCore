import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

// VPN adapters can otherwise become Expo's advertised host. Prefer a physical LAN.
const candidates = Object.entries(os.networkInterfaces())
  .filter(
    ([name]) =>
      !/vpn|tun|virtual|vmware|wsl|docker|vbox|vethernet|hyper-v|default switch/i.test(name),
  )
  .flatMap(([name, addresses]) => (addresses || []).map((address) => ({ name, ...address })))
  .filter(
    (a) =>
      !a.internal &&
      a.family === 'IPv4' &&
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address),
  )
  .sort(
    (a, b) =>
      Number(/wi-?fi|wireless|ethernet/i.test(b.name)) -
      Number(/wi-?fi|wireless|ethernet/i.test(a.name)),
  );
const host = process.env.REACT_NATIVE_PACKAGER_HOSTNAME || candidates[0]?.address;
const env = { ...process.env, ...(host ? { REACT_NATIVE_PACKAGER_HOSTNAME: host } : {}) };
if (host) {
  const portFlag = process.argv.indexOf('--port');
  const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 8081;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Port must be between 1 and 65535');
  const address = new URL(`http://${host}:${port}`).host;
  const link = `exp://${address}`;
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await QRCode.toFile(fileURLToPath(new URL('../public/expo-qr.png', import.meta.url)), link, {
    width: 320,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UniCore · Expo Go</title><style>body{font:16px/1.6 system-ui;background:#101211;color:#F4F5ED;margin:0;padding:32px;display:grid;place-content:center;min-height:85vh;text-align:center}h1{font-size:40px;margin:0}p{max-width:440px;color:#A0AA9D}img{border-radius:20px;max-width:100%;margin:20px auto}a{color:#D4F879}code{font-size:18px}small{color:#A0AA9D}</style><h1>UniCore <span style="color:#D4F879">✳</span></h1><p>ВолГУ · открой свой кампус</p><img src="/expo-qr.png" width="320" height="320" alt="QR-код для Expo Go"><a href="${link}"><code>${link}</code></a><p>Открой Expo Go для SDK 58 на Android и отсканируй QR. Компьютер и телефон должны быть в одной Wi-Fi-сети.</p><a href="/">Посмотреть в браузере →</a><p><small>Только локальная разработка. Оставь Expo-сервер запущенным.</small></p></html>`;
  await writeFile(new URL('../public/connect.html', import.meta.url), html, 'utf8');
  console.log(
    `UniCore LAN: ${link}. Connect your phone to the same network.\nQR page: http://localhost:${port}/connect.html`,
  );
}
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url)),
    'start',
    '--go',
    '--lan',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
