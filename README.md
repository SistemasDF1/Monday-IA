# 🟣 Monday-IA — Personajes de monday.com

Experiencia para eventos: la persona elige uno de los personajes 3D oficiales de
monday.com, se toma una foto, y la IA genera **una sola imagen** donde aparece
posando junto a ese personaje, en el mismo estilo de render.

Usa **Google Gemini 2.5 Flash Image** (Nano Banana) con dos imágenes de
referencia: la foto de la persona y el PNG del personaje elegido.

## ✨ Cómo funciona

Flujo de 2 pasos:

1. **Elegir personaje** — grilla de 7 personajes 3D de monday.com
   (`public/img/personaje/personaje1.png` … `personaje7.png`).
2. **Foto** — con la webcam (cuenta regresiva de 3 segundos) o subiendo un archivo.

El modelo recibe la foto de la persona **y** la imagen del personaje elegido como
referencia visual exacta, y genera una escena donde ambos posan juntos (uno con
la mano en el hombro del otro), manteniendo el traje y los colores del personaje
sin cambios, y el rostro real de la persona (sin caricaturizarlo de más),
renderizados los dos en el mismo estilo 3D. El resultado se entrega en JPEG
optimizado junto con un **código QR** para descargarlo al celular.

## 🧩 Cómo se genera la imagen

Una sola llamada a `gemini-2.5-flash-image` con tres partes: el prompt (función
`promptPersonaje()` en [`server.js`](server.js)), la foto de la persona y el PNG
del personaje. El prompt es explícito en varios puntos que suelen fallar:

- El personaje de monday.com se copia **tal cual** (traje, colores, accesorios) —
  no se rediseña.
- La cara de la persona se mantiene **fiel a la foto real**, no se estiliza en
  exceso.
- Si la persona no trae lentes en la foto, no se le agregan — aunque el
  personaje sí lleve goggles o gafas de sol.
- La pose es de camaradería (uno sujeta al otro del hombro), no un abrazo de
  frente.

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js + Express
- **IA**: Google Generative AI (Gemini 2.5 Flash Image)
- **Imagen**: Sharp (reencuadre y optimización del resultado)
- **QR**: qrcode
- **Upload**: Multer

## 📋 Prerequisitos

- Node.js v18 o superior
- Una API Key de [Google AI Studio](https://aistudio.google.com/app/apikey)

## 🚀 Instalación

```bash
npm install
```

Copia la plantilla de variables de entorno y edítala:

```bash
cp .env.example .env
```

```env
GOOGLE_API_KEY=tu_api_key_aqui
PORT=3000
PUBLIC_URL=http://192.168.1.50:3000
```

Arranca el servidor:

```bash
npm start
```

Y abre `http://localhost:3000`.

### ⚠️ `PUBLIC_URL` es clave en eventos

El QR contiene la URL de descarga de la imagen. Si `PUBLIC_URL` está vacía se usa
el host de la petición: si abres la app en `localhost`, el QR apuntará a
`localhost` y **ningún celular podrá descargar nada**. Configura la IP de la red
local o el dominio público antes del evento.

### 📷 La cámara necesita contexto seguro

`getUserMedia` solo funciona en `localhost` o bajo HTTPS. Si vas a servir la app
desde otra máquina de la red, necesitas HTTPS o los navegadores bloquearán la
cámara.

## 📁 Estructura del proyecto

```
Monday-IA/
├── public/
│   ├── index.html            # Grilla de personajes + paso de la foto
│   ├── style.css             # Paleta y tipografía de marca (monday.com)
│   ├── app.js                # Cámara, generación, QR
│   ├── fonts/                # Figtree, Poppins (monday.com)
│   └── img/
│       ├── monday/           # Logo e ícono oficiales
│       └── personaje/        # Los 7 personajes 3D (referencia visual)
├── scripts/
│   └── instalar-fuentes.mjs  # Instala fuentes en Linux (postinstall)
├── downloads/                # Copia que sirve el QR (se conservan las últimas 30)
├── historias/                # Archivo permanente: una carpeta por generación
├── uploads/                  # Fotos temporales, se borran tras procesarse
├── render.yaml               # Configuración de despliegue en Render
├── comic.js                  # (sin usar por el flujo actual, se conserva por si acaso)
├── server.js                 # Servidor Express + prompt + API de Gemini
├── .env.example               # Plantilla de configuración
└── README.md
```

## 🗄️ Archivo de generaciones

Cada imagen generada se guarda de forma permanente en `historias/`, una carpeta
por generación:

```
historias/
├── index.jsonl                    # Una línea por generación, la más reciente al final
└── monday_1788195516052/
    ├── imagen.jpg                 # La imagen final
    └── datos.json                 # fecha, personajeId, personajeNombre
```

A diferencia de `downloads/` —que solo conserva las últimas 30 para no llenar el
disco— en `historias/` **no se borra nada**.

`GET /api/generaciones` devuelve el índice completo en JSON, de lo más reciente a
lo más antiguo.

La ubicación se controla con `STORAGE_DIR`. Si se deja vacía, se usa la raíz del
proyecto.

## ☁️ Despliegue en Render

**1. El disco es efímero.** Render borra el sistema de archivos en cada deploy y
en cada reinicio. Sin un disco persistente perderías todas las generaciones y
**los QR ya entregados darían 404**. Monta un **Disk** y apunta `STORAGE_DIR` a
su Mount Path:

| Variable | Valor |
|---|---|
| `GOOGLE_API_KEY` | tu API key |
| `STORAGE_DIR` | `/var/data` (el Mount Path del Disk) |

El archivo [`render.yaml`](render.yaml) ya deja esto configurado.

**2. El plan free no sirve para un evento.** Duerme tras 15 minutos de
inactividad y el primer request tarda casi un minuto en responder; además no
admite discos persistentes. Usa al menos el plan Starter.

**El QR no necesita configuración en Render**: se usa `RENDER_EXTERNAL_URL`, que
Render inyecta automáticamente con la URL pública del servicio.

## 🔧 API Endpoints

### `GET /`
Sirve la aplicación.

### `GET /api/health`
```json
{ "status": "OK", "message": "API de personajes monday.com está funcionando", "personajes": 7, "hasApiKey": true }
```

### `POST /api/generate`
Genera la imagen final.

**Body (multipart/form-data)**:

| Campo       | Tipo    | Descripción                                        |
|-------------|---------|-----------------------------------------------------|
| `image`     | archivo | Foto de la persona (JPG, PNG o WEBP, máx. 12MB)      |
| `personaje` | texto   | Id del personaje: `1` a `7`                          |

**Response**:
```json
{
  "success": true,
  "image": "http://.../c/monday_1788190801382/imagen.jpg",
  "downloadUrl": "http://.../c/monday_1788190801382",
  "qrCode": "data:image/png;base64,...",
  "message": "Imagen generada exitosamente"
}
```

### `GET /api/generaciones`
Índice del archivo de generaciones, de la más reciente a la más antigua.
```json
{ "total": 12, "generaciones": [{ "id": "monday_...", "fecha": "...", "personajeId": "1", "personajeNombre": "Performance Analyst" }] }
```

### `GET /c/:id`
Página de la imagen, pensada para el celular: es la URL que va dentro del QR.
Muestra la imagen y ofrece descargarla.

### `GET /c/:id/imagen.jpg`
La imagen generada. Se sirve desde `historias/`, así que **el QR sigue
funcionando aunque la imagen ya haya salido de `downloads/`**.

### `GET /download/:filename`
Fuerza la descarga. El nombre se valida contra `monday_<timestamp>.jpg`.

## 🎨 Personalizar

- **Personajes**: objeto `PERSONAJES` en [`server.js`](server.js) (nombre,
  descripción del traje y ruta al PNG de referencia) y el array `PERSONAJES` en
  [`public/index.html`](public/index.html) (la tarjeta visual). Los `id` deben
  coincidir.
- **El prompt de la imagen final**: función `promptPersonaje()` en
  [`server.js`](server.js) — pose, fidelidad facial, reglas de lentes, fondo.
- **Retención de archivos**: `cleanOldFiles()` en [`server.js`](server.js)
  conserva las últimas 30 imágenes.

## 💰 Costos de la API

- ~$0.039 USD por imagen generada.
- Una imagen tarda entre 20 y 50 segundos.

## 🐛 Solución de problemas

**El QR no funciona al escanearlo** — falta configurar `PUBLIC_URL`. Ver arriba.

**Las generaciones desaparecieron tras un deploy en Render** — falta el disco
persistente. Ver la sección de despliegue: monta un Disk y define `STORAGE_DIR`.

**Le pone lentes a alguien que no usa** — el prompt ya indica explícitamente que
no debe copiar los goggles/gafas del personaje hacia la persona; si vuelve a
pasar, revisa `promptPersonaje()` en `server.js`.

**"No se pudo generar la imagen"** — la API no devolvió imagen, normalmente
porque el filtro de seguridad de Google bloqueó la foto. Prueba con otra foto.

**Error de cámara** — revisa que estés en `localhost` o HTTPS, que ninguna otra
app (Zoom, Meet) tenga la cámara tomada y que el navegador tenga el permiso
concedido.

**Puerto en uso** — cambia `PORT` en el `.env`.

## 🔐 Notas de seguridad

- El endpoint `/api/generate` **no tiene autenticación ni rate limit**: quien
  alcance el servidor consume tu cuota de Gemini. En un evento cerrado no es
  problema; si lo expones a internet, añade un rate limit por IP.
- `cors()` está abierto a cualquier origen.
- Las fotos subidas se borran del disco en cuanto se procesan.
- `multer` está en la versión 1.x, que ya no recibe mantenimiento. Conviene
  migrar a 2.x.

## 🔤 Fuentes

Este repositorio es **público**, así que solo se versionan fuentes de uso libre:
**Figtree** y **Poppins**, ambas de monday.com/Google Fonts, en `public/fonts/`.
No se incluyen fuentes comerciales de proyectos anteriores.

## 🎨 Marca

Logo e ícono oficiales de monday.com en `public/img/monday/`.
Paleta: Lunes morado `#6161FF`, Lunes oscuro `#181B34`, Luz del lunes `#F0F3FF`,
más los colores de apoyo verde `#00CA72`, amarillo `#FFCC00` y rojo `#FB275D`.
Tipografía: Figtree (texto) y Poppins (títulos).

## 📝 Notas adicionales

- Las imágenes generadas incluyen una marca de agua SynthID invisible de Google.
- `downloads/` conserva solo las últimas 30 imágenes; las anteriores se borran y
  sus QR dejan de funcionar. La copia de `historias/` nunca se borra.
