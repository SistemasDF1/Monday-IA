// Elementos DOM
const cameraBtn = document.getElementById('cameraBtn');
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const captureBtn = document.getElementById('captureBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeBtn = document.getElementById('removeBtn');
const generateBtn = document.getElementById('generateBtn');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const loadingOverlay = document.getElementById('loadingOverlay');
const downloadBtn = document.getElementById('downloadBtn');
const newBtn = document.getElementById('newBtn');
const toast = document.getElementById('toast');
const countdownEl = document.getElementById('countdown');
const loadingMsg = document.getElementById('loadingMsg');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fotoSection = document.getElementById('fotoSection');

// La imagen tarda unos segundos: se van rotando mensajes para que la espera se entienda.
const PASOS_CARGA = [
    'Analizando tu foto...',
    'Dibujando tu versión del personaje...',
    'Poniendo el abrazo en su lugar...',
    'Dando color y detalle...',
    'Ya casi está...'
];

let cameraStream = null;
let temporizadorCarga = null;

// Event Listeners
generateBtn.addEventListener('click', generateImage);
downloadBtn.addEventListener('click', downloadImage);
newBtn.addEventListener('click', () => reiniciarProceso());
cameraBtn.addEventListener('click', openCamera);
captureBtn.addEventListener('click', startCountdown);
closeCameraBtn.addEventListener('click', closeCamera);

// Pantalla completa: en el evento la app va proyectada o en una tablet, y la
// barra del navegador roba altura.
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', alternarPantallaCompleta);
    document.addEventListener('fullscreenchange', pintarIconoPantalla);
}

function alternarPantallaCompleta() {
    const doc = document.documentElement;

    if (!document.fullscreenElement) {
        const pedir = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
        if (pedir) pedir.call(doc).catch(err => console.warn('Pantalla completa no disponible:', err));
    } else {
        const salir = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (salir) salir.call(document).catch(() => {});
    }
}

function pintarIconoPantalla() {
    const icono = document.getElementById('iconoExpandir');
    if (!icono) return;

    icono.setAttribute('d', document.fullscreenElement
        ? 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3'
        : 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3');
    fullscreenBtn.title = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
}

removeBtn.addEventListener('click', () => {
    imagePreview.src = '';
    previewContainer.style.display = 'none';
    generateBtn.style.display = 'none';
    checkFormValid();
});

// Funciones
function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

function tieneFoto() {
    return !!imagePreview.src && imagePreview.src.startsWith('data:image');
}

// El botón solo se habilita con foto Y personaje elegido
function checkFormValid() {
    generateBtn.disabled = !(tieneFoto() && window.personajeSeleccionado);
}

// Con la foto tomada se muestra la vista previa y el botón de generar directo,
// ya no hay un paso intermedio de historia.
function mostrarBotonGenerar() {
    previewContainer.style.display = 'block';
    generateBtn.style.display = 'block';
    checkFormValid();
}

// Iniciar cuenta regresiva
function startCountdown() {
    let count = 3;
    countdownEl.style.display = 'block';
    countdownEl.textContent = count;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
        } else {
            clearInterval(timer);
            countdownEl.style.display = 'none';
            captureImage();
        }
    }, 1000);
}

// Lado mayor de la foto que se envía. Una captura de webcam en PNG puede pesar
// varios MB y chocar con el límite de subida; en JPEG a este tamaño baja a unos
// cientos de KB sin perder detalle facial, que es lo único que necesita el modelo.
const FOTO_LADO_MAXIMO = 1280;
const FOTO_CALIDAD = 0.92;

function captureImage() {
    const anchoOriginal = cameraVideo.videoWidth;
    const altoOriginal = cameraVideo.videoHeight;

    if (!anchoOriginal || !altoOriginal) {
        showToast('La cámara aún no está lista, inténtalo de nuevo', 'error');
        return;
    }

    const escala = Math.min(1, FOTO_LADO_MAXIMO / Math.max(anchoOriginal, altoOriginal));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(anchoOriginal * escala);
    canvas.height = Math.round(altoOriginal * escala);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    imagePreview.src = canvas.toDataURL('image/jpeg', FOTO_CALIDAD);

    cameraModal.style.display = 'none';
    detenerCamara();
    mostrarBotonGenerar();
}

// Generar la imagen con la foto capturada y el personaje elegido
async function generateImage() {
    if (!tieneFoto()) {
        showToast('La foto es requerida', 'error');
        return;
    }

    if (!window.personajeSeleccionado) {
        showToast('Elige un personaje primero', 'error');
        return;
    }

    loadingOverlay.style.display = 'flex';
    generateBtn.disabled = true;
    iniciarMensajesCarga();

    try {
        const formData = new FormData();
        const foto = dataURLtoFile(imagePreview.src, 'foto.jpg');
        console.log('Foto a enviar:', Math.round(foto.size / 1024), 'KB');
        formData.append('image', foto);
        formData.append('personaje', window.personajeSeleccionado);

        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        // Un 502 de la plataforma devuelve HTML, no JSON: hay que preverlo
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`El servidor respondió con un error (${response.status}). Vuelve a intentarlo.`);
        }

        if (!response.ok) {
            // details trae la causa real; sin él solo se ve un mensaje genérico
            console.error('Error del servidor:', data);
            const detalle = data.details ? ` (${data.details})` : '';
            throw new Error(`${data.error || 'Error al generar la imagen'}${detalle}`);
        }

        resultImage.onerror = () => {
            console.error('No se pudo cargar la imagen generada:', data.image);
            showToast('La imagen se generó pero no cargó. Usa el QR o el enlace.', 'error');
        };
        resultImage.src = data.image;

        // El resultado es su propio paso: se retira todo lo anterior para que
        // no se acumule ni haga falta scroll.
        if (fotoSection) fotoSection.style.display = 'none';
        generateBtn.style.display = 'none';

        resultSection.style.display = 'block';

        // El resultado necesita más ancho que el wizard para que la imagen y el
        // QR quepan lado a lado
        const panel = document.querySelector('#generatorContainer .main-content');
        if (panel) panel.style.maxWidth = '1000px';

        // El QR va PRIMERO: es lo que la persona se lleva. Si se pinta después
        // del confeti, cualquier fallo de esa librería (viene de un CDN externo
        // que muchas redes bloquean) se lleva el QR por delante.
        if (data.qrCode) {
            showQRCode(data.qrCode, data.downloadUrl);
        } else {
            console.warn('El servidor no devolvió código QR');
        }

        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('¡Tu imagen está lista! 🎉', 'success');

        // Decorativo: nunca debe romper el flujo
        try {
            lanzarConfeti();
        } catch (error) {
            console.warn('No se pudo lanzar el confeti:', error);
        }
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Error al generar la imagen', 'error');
    } finally {
        detenerMensajesCarga();
        loadingOverlay.style.display = 'none';
        checkFormValid();
    }
}

function iniciarMensajesCarga() {
    let paso = 0;
    loadingMsg.textContent = PASOS_CARGA[0];
    temporizadorCarga = setInterval(() => {
        paso = Math.min(paso + 1, PASOS_CARGA.length - 1);
        loadingMsg.textContent = PASOS_CARGA[paso];
    }, 5000);
}

function detenerMensajesCarga() {
    clearInterval(temporizadorCarga);
    temporizadorCarga = null;
}

function lanzarConfeti() {
    if (typeof window.confetti !== 'function') return;

    // shapeFromText no existe en versiones antiguas de la librería
    if (typeof window.confetti.shapeFromText === 'function') {
        const scalar = 3;
        const globo = window.confetti.shapeFromText({ text: '💥', scalar });

        window.confetti({
            particleCount: 25,
            spread: 100,
            origin: { y: 0.6 },
            shapes: [globo],
            scalar: scalar,
            gravity: 0.7,
            ticks: 300
        });
    }

    window.confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6161FF', '#FFFFFF', '#181B34'],
        shapes: ['circle'],
        gravity: 0.6
    });
}

function downloadImage() {
    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    const hora = String(fecha.getHours()).padStart(2, '0');
    const minuto = String(fecha.getMinutes()).padStart(2, '0');
    const segundo = String(fecha.getSeconds()).padStart(2, '0');
    const nombreArchivo = `Monday_${dia}-${mes}-${anio}_${hora}-${minuto}-${segundo}.jpg`;

    const link = document.createElement('a');
    link.href = resultImage.src;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Imagen descargada', 'success');
}

function restaurarAnchoPanel() {
    const panel = document.querySelector('#generatorContainer .main-content');
    if (panel) panel.style.maxWidth = '500px';
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Abrir la cámara
async function openCamera() {
    cameraModal.style.display = 'block';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Tu navegador no permite acceso a la cámara. Asegúrate de usar HTTPS o localhost.');
        cameraModal.style.display = 'none';
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraVideo.srcObject = cameraStream;
    } catch (err) {
        console.error('Error de cámara:', err);

        let msg = 'No se pudo acceder a la cámara.';
        if (err.name === 'NotFoundError' || (err.message || '').includes('not found')) {
            msg = 'No se detectó ninguna cámara conectada. Si estás en PC, conecta una webcam.';
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg = 'Permiso denegado. Debes permitir el acceso a la cámara en la barra de dirección.';
        } else if (err.name === 'NotReadableError') {
            msg = 'La cámara está siendo usada por otra aplicación (Zoom, Meet, etc).';
        }

        alert(`${msg}\n\nDetalle técnico: ${err.message || err.name}`);
        cameraModal.style.display = 'none';
    }
}

function detenerCamara() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

function closeCamera() {
    cameraModal.style.display = 'none';
    detenerCamara();
}

// Verificar salud de la API al cargar
async function checkApiHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (!data.hasApiKey) {
            showToast('⚠️ Configura tu GOOGLE_API_KEY en el archivo .env', 'error');
        }
    } catch (error) {
        console.error('Error al verificar la API:', error);
    }
}

// Mostrar QR de descarga
function showQRCode(qrCodeDataUrl, urlDescarga) {
    const qrContainer = document.getElementById('qr-container');
    if (!qrContainer) {
        console.error('No existe #qr-container: no se puede mostrar el QR');
        return;
    }

    qrContainer.innerHTML = '';

    // Tarjeta blanca: el QR necesita fondo claro para que la cámara lo lea bien
    const tarjeta = document.createElement('div');
    tarjeta.style.cssText = 'background:#ffffff; padding:16px; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.35); display:flex; flex-direction:column; align-items:center; gap:10px;';

    const title = document.createElement('div');
    title.textContent = 'Escanea para descargar';
    title.style.cssText = 'color:#181B34; font-size:1rem; font-weight:700; text-align:center;';
    tarjeta.appendChild(title);

    const qrImg = document.createElement('img');
    qrImg.src = qrCodeDataUrl;
    qrImg.alt = 'Código QR de descarga';
    qrImg.style.cssText = 'width:210px; height:210px; display:block;';
    tarjeta.appendChild(qrImg);

    const pie = document.createElement('div');
    pie.textContent = 'Apunta la cámara de tu celular';
    pie.style.cssText = 'color:#5C6C75; font-size:0.8rem; text-align:center;';
    tarjeta.appendChild(pie);

    // Respaldo: si la cámara no lee el QR, el enlace sigue siendo utilizable
    if (urlDescarga) {
        const enlace = document.createElement('a');
        enlace.href = urlDescarga;
        enlace.target = '_blank';
        enlace.rel = 'noopener';
        enlace.textContent = 'Abrir en este dispositivo';
        enlace.style.cssText = 'color:#2E19AA; font-size:0.85rem; font-weight:600; text-decoration:underline;';
        tarjeta.appendChild(enlace);
    }

    qrContainer.appendChild(tarjeta);
}

// Ejecutar al cargar la página
checkApiHealth();
