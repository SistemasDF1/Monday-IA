import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import QRCode from 'qrcode';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// URL pública del servidor: es la que va dentro del QR, así que tiene que ser
// alcanzable desde el celular del asistente.
// RENDER_EXTERNAL_URL la inyecta Render automáticamente, así que en Render no hay
// nada que configurar.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');

// Sirve para comprobar de un vistazo que el proceso corre el codigo actual.
const MOTOR = 'personaje-abrazo-v6';

// Carpeta donde vive todo lo que debe sobrevivir.
// En Render el disco del contenedor se borra en cada deploy: hay que montar un
// Disk y apuntar STORAGE_DIR a su Mount Path (por ejemplo /var/data).
const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : __dirname;

const UPLOAD_DIR = path.join(__dirname, 'uploads');            // temporal, no persiste
const DOWNLOAD_DIR = path.join(STORAGE_DIR, 'downloads');      // lo que sirve el QR
const HISTORIAS_DIR = path.join(STORAGE_DIR, 'historias');     // archivo permanente

for (const dir of [UPLOAD_DIR, DOWNLOAD_DIR, HISTORIAS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

// Configuración de multer para manejar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // No se usa file.originalname: viene del cliente y puede contener rutas ("../").
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + (MIME_EXT[file.mimetype] || '.bin'));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // margen para fotos de cámaras de alta resolución
  fileFilter: (req, file, cb) => {
    if (MIME_EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG y WEBP'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOAD_DIR));

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Personajes 3D oficiales de monday.com disponibles para elegir. La imagen es
// la referencia visual exacta que se manda al modelo junto con la foto de la
// persona; la descripción refuerza en texto lo que debe copiar tal cual.
const PERSONAJES = {
  1: {
    nombre: 'Performance Analyst',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje1.png'),
    descripcion: 'Traje de rescate/aviador naranja intenso con cuello alto, cierre y ribetes azul cielo, hombreras con dos franjas blancas diagonales, parche circular con insignia en el pecho, bolsillo con solapa, franja blanca y naranja clara en la manga izquierda con parche, cinturón central azul, botas naranjas con detalles azules. Cabello afro oscuro y voluminoso, gafas tipo esquí/aviador tintadas de azul sobre el rostro, audífonos con micrófono de diadema.'
  },
  2: {
    nombre: 'Piloto Rosa',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje2.png'),
    descripcion: 'Traje de piloto azul con paneles internos en rosa y celeste, hombreras con franjas blancas diagonales, solapa blanca triangular en el pecho, cinturón rosa con hebilla azul, bolsillo pequeño en el pecho, botas azul oscuro/moradas con franjas rosas. Cabello recogido en dos moños (chonguitos) color morado oscuro, orejeras lavanda, gafas de aviador azules sobre la frente.'
  },
  3: {
    nombre: 'Piloto Nocturno',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje3.png'),
    descripcion: 'Traje de piloto azul marino ajustado, franja naranja vertical al centro y en los costados, hombreras naranjas, cuello blanco/gris, cierre celeste, guantes azul marino, botas azul marino con puntera naranja. Cabello oscuro suelto hasta los hombros, orejeras grises, gafas rosa/azul sobre la cabeza.'
  },
  4: {
    nombre: 'Comandante Turquesa',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje4.png'),
    descripcion: 'Traje de vuelo turquesa/cian con franjas blancas dobles en los hombros, camisa interior amarilla visible en el pecho, cinturón azul turquesa, rodilleras ovaladas del mismo color, guantes azules con franja blanca en la muñeca, botas turquesas altas con textura. Cabello y bigote canosos, gafas de aviador con lentes ámbar/naranja, audífonos con micrófono tipo boom.'
  },
  5: {
    nombre: 'Piloto Fucsia',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje5.png'),
    descripcion: 'Traje enterizo rosa fuerte (magenta) con paneles interiores naranjas, hombreras con doble franja blanca, bolsillo con línea naranja en el pecho, cinturón, botas rosas con franjas naranjas. Casco rosa integrado con orejeras grandes tipo pompón y visor degradado de azul a rosa.'
  },
  6: {
    nombre: 'Piloto Atardecer',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje6.png'),
    descripcion: 'Chaqueta naranja de hombreras muy anchas sobre mono/pantalón celeste, cinturón celeste, botas naranjas con franjas celestes, franjas blancas dobles en los hombros. Casco naranja integrado con orejeras rosas grandes y visor degradado de azul a rosa.'
  },
  7: {
    nombre: 'Piloto Ártico',
    archivo: path.join(__dirname, 'public', 'img', 'personaje', 'personaje7.png'),
    descripcion: 'Traje enterizo azul (celeste medio) liso de cuerpo completo, cuello alto, cierre central celeste, pequeños detalles rectangulares en el pecho, botas blancas. Cabello blanco muy voluminoso tipo boina, gafas de sol rosa/fucsia redondas, orejeras azules.'
  }
};

// Poses "corporativas" para la escena. Se elige una al azar en cada
// generación para que no siempre salga la misma pose.
const POSES_CORPORATIVAS = [
  'De pie uno junto al otro, ambos con los brazos cruzados y actitud segura, mirando a cámara, como una foto de equipo corporativa.',
  'Chocando los puños (fist bump) entre ellos, ambos sonriendo a cámara.',
  'Dándose un choca esos cinco (high five) con las manos en alto entre los dos.',
  'Estrechándose la mano en un saludo profesional, mirando a cámara, actitud segura.',
  'Uno con el brazo apoyado sobre el hombro del otro, ambos con el pulgar arriba y sonriendo.',
  'De pie, uno señalando hacia adelante con confianza como si presentara algo, el otro a su lado con los brazos cruzados.',
  'Espalda con espalda, ambos con los brazos cruzados, actitud segura, tipo póster corporativo.',
  'Ambos con los brazos cruzados, sonriendo a cámara, postura firme, tipo foto oficial de equipo.'
];

function elegirPoseAlAzar() {
  return POSES_CORPORATIVAS[Math.floor(Math.random() * POSES_CORPORATIVAS.length)];
}

// Prompt de la imagen final: la persona real, posando junto al personaje
// oficial de monday.com elegido. El personaje va también como imagen de
// referencia (no solo descrito en texto) para que el modelo lo copie tal
// cual, en vez de reinventarlo.
function promptPersonaje({ personaje, pose }) {
  return `TAREA MÁS IMPORTANTE, léela primero: en la imagen que vas a crear, uno de los dos personajes debe tener LA CARA REAL Y EXACTA de la persona de la PRIMERA imagen adjunta, solo que renderizada en 3D. No es una cara genérica "inspirada" en ella: es un retrato 3D de ESA persona específica, con la misma precisión con la que un estudio hace un avatar/Bitmoji personalizado a partir de una foto.

Antes de dibujar, MIRA con atención la PRIMERA imagen y toma nota mental de sus rasgos únicos: forma exacta de la cara (ovalada, cuadrada, redonda, alargada...), forma y color exactos de los ojos, forma de la nariz, forma de la boca y labios, forma y grosor de las cejas, línea del cabello, mentón, pómulos, y cualquier rasgo distintivo (lunares, pecas, barba, bigote, arrugas de expresión). Reproduce TODOS esos rasgos con fidelidad al pasarla a 3D. Si al final la cara generada podría ser la de otra persona cualquiera, está MAL: vuelve a mirar la foto y corrígelo.

TONO DE PIEL, con la misma prioridad: usa EXACTAMENTE el mismo tono de piel que se ve en la PRIMERA imagen. Míralo con cuidado antes de dibujar (claro, medio, oscuro, con sus matices reales) y reprodúcelo tal cual, ni más claro ni más oscuro que en la foto. No uses un tono de piel genérico ni el de ningún otro personaje de referencia.

Vas a crear UNA SOLA imagen ilustrada en 3D, con el mismo estilo de render tipo "figura/mascota de juguete" que tiene la SEGUNDA imagen adjunta.

HAY DOS IMÁGENES DE REFERENCIA:
1. La PRIMERA imagen es la foto real de la persona cuya cara y tono de piel debes reproducir con fidelidad (ver arriba).
2. La SEGUNDA imagen es "${personaje.nombre}", un personaje 3D oficial de monday.com. Cópialo TAL CUAL aparece en la imagen: mismo traje, mismos colores exactos, mismo peinado, mismos accesorios (gafas, cascos, audífonos, etc.) y el mismo estilo de render (plástico/juguete brillante, sombreado suave, iluminación de estudio). No lo rediseñes ni inventes variaciones, úsalo como referencia visual exacta.
Para reforzarlo en texto: ${personaje.descripcion}

QUÉ DEBES DIBUJAR:
Una escena con AMBOS personajes de pie, posando juntos en esta pose específica: ${pose}

- El personaje de monday.com (segunda imagen): EXACTAMENTE igual a la referencia, sin cambiar su traje, sus colores ni sus accesorios.
- El segundo personaje es la persona de la PRIMERA imagen, con su cara real y su tono de piel real (ver arriba) y su cabello real (mismo color, largo y peinado), convertida a este mismo estilo de render 3D pero SIN caricaturizar ni estilizar de más los rasgos. Dale ropa casual simple y neutra: NO le pongas el traje de monday.com ni copies la ropa de la foto original.
- LENTES: mira la PRIMERA imagen con cuidado. Si la persona NO trae lentes puestos, dibújala SIN lentes de ningún tipo (ni de sol ni graduados, ni goggles). Si SÍ trae lentes en la foto, cópialos tal cual. Los goggles/gafas del personaje de monday.com son SOLO de ese personaje: no se los pongas a la persona por imitación, aunque el personaje los lleve puestos.
- Ambos personajes deben compartir el MISMO estilo de render, la misma calidad de materiales, la misma iluminación y proporciones de mascota/figura de colección.

FONDO Y COMPOSICIÓN:
Fondo blanco o gris muy claro, liso, tipo estudio de producto, igual que el de la imagen de referencia del personaje. Sin escenografía, sin texto, sin logotipos, sin marcos. Encuadre de cuerpo completo o 3/4, centrado, con espacio parejo alrededor de ambos personajes.

IMPORTANTE:
- Una sola imagen, un solo par de personajes posando juntos.
- No copies el fondo de la foto original de la persona.
- No mezcles los trajes: cada personaje conserva su propio vestuario.
- Antes de terminar, revisa: ¿la cara y el tono de piel del segundo personaje reproducen con fidelidad lo que se ve en la PRIMERA imagen? Si tienes duda, prioriza el parecido real por encima del estilo.`;
}

// Genera la imagen final y devuelve su buffer. Reintenta una vez: los fallos
// puntuales de la API son frecuentes.
async function generarImagenPersonaje({ model, fotoUsuario, mimeTypeUsuario, fotoPersonaje, prompt }) {
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { mimeType: mimeTypeUsuario, data: fotoUsuario } },
        { inlineData: { mimeType: 'image/png', data: fotoPersonaje } }
      ]);

      for (const part of result.response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return Buffer.from(part.inlineData.data, 'base64');
        }
      }
      console.warn(`Generación de imagen: la API no devolvió imagen (intento ${intento})`);
    } catch (error) {
      console.warn(`Generación de imagen falló (intento ${intento}): ${error.message}`);
    }
  }
  return null;
}

// Guarda una carpeta por generación con la imagen y sus datos.
// Es el archivo permanente del evento: a diferencia de downloads/, aquí no se
// borra nada.
async function archivarResultado({ id, personajeId, personajeNombre, imagenBase64, downloadUrl }) {
  const carpeta = path.join(HISTORIAS_DIR, id);
  fs.mkdirSync(carpeta, { recursive: true });

  const datos = {
    id,
    fecha: new Date().toISOString(),
    personajeId,
    personajeNombre,
    archivo: 'imagen.jpg',
    downloadUrl
  };

  fs.writeFileSync(path.join(carpeta, 'imagen.jpg'), Buffer.from(imagenBase64, 'base64'));
  fs.writeFileSync(path.join(carpeta, 'datos.json'), JSON.stringify(datos, null, 2), 'utf8');

  // Índice de una línea por generación, para revisarlo todo de un vistazo
  fs.appendFileSync(
    path.join(HISTORIAS_DIR, 'index.jsonl'),
    JSON.stringify({ id: datos.id, fecha: datos.fecha, personajeId, personajeNombre }) + '\n',
    'utf8'
  );

  return carpeta;
}

// Mantener solo las últimas 30 imágenes generadas
async function cleanOldFiles() {
  try {
    if (!fs.existsSync(DOWNLOAD_DIR)) return;

    const files = fs.readdirSync(DOWNLOAD_DIR)
      .filter(file => file.startsWith('monday_') && file.endsWith('.jpg'))
      .map(file => ({
        name: file,
        path: path.join(DOWNLOAD_DIR, file),
        time: fs.statSync(path.join(DOWNLOAD_DIR, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      files.slice(30).forEach(file => {
        fs.unlinkSync(file.path);
        console.log('Archivo eliminado:', file.name);
      });
    }
  } catch (error) {
    console.error('Error limpiando archivos:', error);
  }
}

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para generar la imagen (persona + personaje elegido, posando juntos)
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    const personajeId = (req.body.personaje || '').trim();
    const personaje = PERSONAJES[personajeId];

    if (!req.file) {
      return res.status(400).json({ error: 'La foto es requerida' });
    }
    if (!personaje) {
      return res.status(400).json({ error: 'Selecciona un personaje válido' });
    }

    // Leer la foto del usuario
    const imagePath = req.file.path;
    const fotoUsuario = fs.readFileSync(imagePath).toString('base64');
    const mimeTypeUsuario = req.file.mimetype;

    // El archivo temporal ya no hace falta: la foto vive en memoria
    fs.unlinkSync(imagePath);

    // Referencia visual exacta del personaje elegido
    const fotoPersonaje = fs.readFileSync(personaje.archivo).toString('base64');

    console.log(`Generando imagen (personaje: ${personaje.nombre})...`);

    const modelImagen = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

    const imagenBuffer = await generarImagenPersonaje({
      model: modelImagen,
      fotoUsuario,
      mimeTypeUsuario,
      fotoPersonaje,
      prompt: promptPersonaje({ personaje, pose: elegirPoseAlAzar() })
    });

    if (!imagenBuffer) {
      return res.status(502).json({
        error: 'No se pudo generar la imagen',
        details: 'El modelo no devolvió una imagen. Intenta con otra foto.'
      });
    }

    // Se reencuadra a un JPEG de tamaño razonable para servir rápido
    const processedImageBuffer = await sharp(imagenBuffer)
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    const processedImageBase64 = processedImageBuffer.toString('base64');

    // Copia que sirve el QR (esta carpeta sí se va rotando)
    const id = `monday_${Date.now()}`;
    const filename = `${id}.jpg`;
    fs.writeFileSync(path.join(DOWNLOAD_DIR, filename), processedImageBuffer);

    await cleanOldFiles();

    const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    // El QR apunta a una página propia de la imagen, más cómoda en el celular que
    // el archivo suelto: muestra la imagen y ofrece descargarla.
    const downloadUrl = `${base}/c/${id}`;
    console.log('URL de descarga generada:', downloadUrl);

    // Copia permanente en carpeta (útil en local)
    try {
      const carpeta = await archivarResultado({
        id,
        personajeId,
        personajeNombre: personaje.nombre,
        imagenBase64: processedImageBase64,
        downloadUrl
      });
      console.log('Generación archivada en:', carpeta);
    } catch (error) {
      // Que falle el archivado no debe dejar al asistente sin su imagen
      console.error('No se pudo archivar la generación:', error.message);
    }

    const qrCode = await QRCode.toDataURL(downloadUrl);

    // Se mandan URLs, no la imagen en base64: así la respuesta pesa unos KB en
    // vez de varios MB. Ojo: "image" tiene que apuntar al JPEG, no a la página
    // /c/<id>, o el <img> del navegador no puede pintarlo.
    res.json({
      success: true,
      image: `${base}/c/${id}/imagen.jpg`,
      downloadUrl,
      qrCode,
      message: 'Imagen generada exitosamente'
    });

  } catch (error) {
    console.error('Error al generar la imagen:', error?.stack || error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Mensaje accionable para quien atiende el stand
    const mensaje = /safety|blocked|policy/i.test(error.message || '')
      ? 'La IA rechazó la foto. Prueba con otra foto.'
      : /quota|rate|429/i.test(error.message || '')
        ? 'Se alcanzó el límite de la API de Google. Espera un momento e inténtalo de nuevo.'
        : /timeout|ETIMEDOUT|ECONNRESET|fetch failed/i.test(error.message || '')
          ? 'La conexión con la IA falló. Vuelve a intentarlo.'
          : 'Error al generar la imagen';

    res.status(500).json({
      error: mensaje,
      details: error.message
    });
  }
});

// Endpoint de salud. Sirve para diagnosticar un despliegue sin entrar al log:
// dice si hay API key y si el almacenamiento sobrevive a un reinicio.
app.get('/api/health', async (req, res) => {
  let generacionesGuardadas = 0;
  try {
    const indice = path.join(HISTORIAS_DIR, 'index.jsonl');
    if (fs.existsSync(indice)) {
      generacionesGuardadas = fs.readFileSync(indice, 'utf8').split('\n').filter(Boolean).length;
    }
  } catch { /* si no se puede leer, se reporta 0 */ }

  res.json({
    status: 'OK',
    message: 'API de personajes monday.com está funcionando',
    motor: MOTOR,
    personajes: Object.keys(PERSONAJES).length,
    hasApiKey: !!process.env.GOOGLE_API_KEY,
    almacenamiento: {
      dir: STORAGE_DIR,
      persistente: !!process.env.STORAGE_DIR,
      generacionesGuardadas,
      detalle: process.env.STORAGE_DIR
        ? 'STORAGE_DIR configurado: las imágenes sobreviven a los reinicios'
        : 'SIN STORAGE_DIR: en Render las imágenes se borran al reiniciar y el QR quedará en 404'
    },
    urlPublica: PUBLIC_URL || null
  });
});

// Ruta en disco de la imagen. Se busca en historias/ (permanente) y, si no está,
// en downloads/ (que se va rotando).
function rutaImagen(id) {
  const permanente = path.join(HISTORIAS_DIR, id, 'imagen.jpg');
  if (fs.existsSync(permanente)) return permanente;

  const temporal = path.join(DOWNLOAD_DIR, `${id}.jpg`);
  if (fs.existsSync(temporal)) return temporal;

  return null;
}

// Imagen generada.
app.get('/c/:id/imagen.jpg', (req, res) => {
  if (!/^monday_\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Identificador inválido' });
  }

  const ruta = rutaImagen(req.params.id);
  if (!ruta) return res.status(404).json({ error: 'Imagen no encontrada' });

  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Disposition', `inline; filename="${req.params.id}.jpg"`);
  res.type('image/jpeg').sendFile(ruta);
});

// Página que abre el QR en el celular: la imagen y un botón para guardarla.
app.get('/c/:id', (req, res) => {
  const id = req.params.id;
  if (!/^monday_\d+$/.test(id)) return res.status(400).send('Identificador inválido');

  try {
    if (!rutaImagen(id)) {
      return res.status(404).send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="icon" type="image/png" href="/img/monday/monday_icon.png">
        <title>Imagen no encontrada</title></head>
        <body style="margin:0;min-height:100vh;display:flex;flex-direction:column;gap:18px;align-items:center;justify-content:center;background:#181B34;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px;">
          <img src="/img/monday/monday_logo_white.svg" alt="monday.com" style="height:42px;">
          <div><h1 style="color:#6161FF;font-size:1.3rem;">Imagen no encontrada</h1>
          <p style="opacity:.8">Puede que este enlace haya caducado.</p></div>
        </body></html>`);
    }

    res.set('Cache-Control', 'no-store');
    res.send(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/img/monday/monday_icon.png">
  <link rel="apple-touch-icon" href="/img/monday/monday_icon.png">
  <title>Tu imagen</title>
  <style>
    /* Tipografía de marca, servida desde public/fonts */
    @font-face {
      font-family: 'Figtree';
      src: url('/fonts/Figtree/Figtree-VariableFont_wght.ttf') format('truetype-variations');
      font-weight: 300 900; font-display: swap;
    }
    @font-face {
      font-family: 'Poppins';
      src: url('/fonts/Poppins/Poppins-ExtraBold.ttf') format('truetype');
      font-weight: 800; font-display: swap;
    }

    :root { color-scheme: dark; }
    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: #fff;
      font-family: 'Figtree', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 22px 16px 44px;
      gap: 22px;
      position: relative;
      overflow-x: hidden;
    }

    /* Mismo fondo que la aplicación: base oscura, retícula y resplandor morado */
    body::before {
      content: '';
      position: fixed; inset: 0; z-index: -2;
      background-color: #181B34;
      background-image:
        linear-gradient(rgba(255,255,255,0.030) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.030) 1px, transparent 1px);
      background-size: 88px 88px, 88px 88px;
      background-position: center top;
    }
    body::after {
      content: '';
      position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background:
        radial-gradient(ellipse 70% 46% at 50% -4%, rgba(97,97,255,0.20), transparent 62%),
        radial-gradient(ellipse 52% 60% at 2% 34%, rgba(97,97,255,0.13), transparent 66%),
        radial-gradient(ellipse 52% 60% at 98% 34%, rgba(97,97,255,0.11), transparent 66%),
        radial-gradient(ellipse 90% 70% at 50% 52%, transparent 42%, rgba(0,10,16,0.72) 100%);
    }

    .logo { height: 46px; width: auto; filter: drop-shadow(0 2px 8px rgba(0,0,0,.5)); }

    h1 {
      font-family: 'Poppins', system-ui, -apple-system, sans-serif;
      font-size: 1.7rem; margin: 0; text-align: center; font-weight: 800;
      letter-spacing: -0.02em;
      background-image: linear-gradient(100deg, #6161FF 0%, #97AEFF 55%, #DED4FC 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      color: transparent;
    }

    .comic {
      width: 100%; max-width: 760px; height: auto;
      border-radius: 14px;
      box-shadow: 0 12px 44px rgba(0,0,0,.55);
    }

    .acciones { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 360px; }

    a.boton {
      display: block; text-align: center; text-decoration: none;
      padding: 16px 24px; border-radius: 28px;
      font-size: 1.05rem; font-weight: 700;
      background: linear-gradient(135deg, #6161FF, #2E19AA); color: #fff;
      box-shadow: 0 6px 20px rgba(97,97,255,.28);
    }

    p.ayuda {
      opacity: .72; font-size: .85rem; text-align: center;
      margin: 0; max-width: 360px; line-height: 1.5;
    }
  </style>
</head>
<body>
  <img class="logo" src="/img/monday/monday_logo_white.svg" alt="monday.com">
  <h1>Tu imagen está lista</h1>
  <img class="comic" src="/c/${id}/imagen.jpg" alt="Tu imagen">
  <div class="acciones">
    <a class="boton" href="/c/${id}/imagen.jpg" download="${id}.jpg">Descargar imagen</a>
  </div>
  <p class="ayuda">Si el botón no guarda la imagen, mantén el dedo sobre ella y elige “Guardar imagen”.</p>
</body>
</html>`);
  } catch (error) {
    res.status(500).send('Error al abrir la imagen');
  }
});

// Listado del archivo de generaciones, de la más reciente a la más antigua.
app.get('/api/generaciones', (req, res) => {
  try {
    const indice = path.join(HISTORIAS_DIR, 'index.jsonl');
    if (!fs.existsSync(indice)) return res.json({ total: 0, generaciones: [] });

    const generaciones = fs.readFileSync(indice, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(linea => { try { return JSON.parse(linea); } catch { return null; } })
      .filter(Boolean)
      .reverse();

    res.json({ total: generaciones.length, generaciones });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo leer el archivo de generaciones', details: error.message });
  }
});

// Descarga forzada. El nombre se valida contra un patrón fijo: viene de la URL
// y sin esto un "../" permitiría leer cualquier archivo del servidor (por ejemplo .env).
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;

  if (!/^monday_\d+\.jpg$/.test(filename)) {
    return res.status(400).json({ error: 'Nombre de archivo inválido' });
  }

  const filePath = path.join(DOWNLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// Manejador de errores: sin esto multer devuelve HTML y el frontend revienta al
// hacer response.json() (archivo muy grande o formato no permitido).
app.use((err, req, res, next) => {
  console.error('Error de petición:', err.message);
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'La foto pesa demasiado. Vuelve a tomarla.'
      : `Error al subir la foto: ${err.message}`;
    return res.status(400).json({ error: msg });
  }
  res.status(400).json({ error: err.message || 'Petición inválida' });
});

app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`💥 Generador de imágenes con personajes monday.com está listo`);
  console.log(`   motor: ${MOTOR} · ${Object.keys(PERSONAJES).length} personajes`);

  console.log(`   generaciones: ${HISTORIAS_DIR}`);
  console.log(`   URL pública: ${PUBLIC_URL || '(no configurada, se usa el host de la petición)'}`);

  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  ADVERTENCIA: No se encontró GOOGLE_API_KEY en el archivo .env');
  }
  if (!PUBLIC_URL) {
    console.warn('⚠️  Sin PUBLIC_URL ni RENDER_EXTERNAL_URL: si abres la app en localhost, el QR no funcionará desde un celular.');
  }
  if (!process.env.STORAGE_DIR && process.env.RENDER) {
    console.warn('⚠️  Sin STORAGE_DIR: en Render las imágenes se borran al reiniciar y los QR ya entregados darán 404.');
    console.warn('   Monta un Disk y apunta STORAGE_DIR a su Mount Path.');
  }

  for (const [id, personaje] of Object.entries(PERSONAJES)) {
    if (!fs.existsSync(personaje.archivo)) {
      console.error(`❌ Falta la imagen del personaje ${id} (${personaje.nombre}): ${personaje.archivo}`);
    }
  }
});
