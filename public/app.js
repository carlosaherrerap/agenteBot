// public/app.js
const qrImg = document.getElementById('qr');
const status = document.getElementById('status');

async function refreshQr() {
  try {
    const res = await fetch('/qr');
    if (res.ok) {
      qrImg.src = '/qr?' + Date.now();
      status.textContent = 'Escanea el QR con WhatsApp para iniciar sesión';
    } else {
      qrImg.src = '';
      status.textContent = 'QR no generado todavía';
    }
  } catch {
    qrImg.src = '';
    status.textContent = 'Error al obtener QR';
  }
}

refreshQr();
setInterval(refreshQr, 2000);