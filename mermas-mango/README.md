# Mermas Mango — App Angular (PWA + APK)

Aplicación **Angular 20** para el control de mermas de mango por lote. Registra mermas,
consulta, saca informes por lote, tiene login con roles y **funciona sin conexión**.
Es una **PWA** (instalable desde el navegador) y se puede empaquetar como **APK de Android**.

- **Color:** verde. **Sin emojis:** iconos de **FontAwesome** (incluido en local, funciona offline).
- **Pantalla principal:** captura rápida — línea `L1–L4`, lote (solo números), tipo de merma,
  cantidad (0–100 kg, 2 decimales), botón **Subir** e interruptor **"mantener datos del lote"**.
- **Login JWT (12 h) con roles:** `admin`, `capturista`, `reportes`.
- **Offline real:** los datos se guardan en el dispositivo (IndexedDB) y los cambios hechos sin
  internet se **sincronizan solos** al reconectar (service worker de Angular + cola de envíos).

---

## 1. Requisitos

- **Node.js 20.19+ o 22.12+** (Angular 20).
- El **backend** (API FastAPI) corriendo. Por defecto la app apunta a `http://127.0.0.1:8017`
  (se puede cambiar desde el **login → "cambiar"** o en **Ajustes**).
- Para el **APK**: Android Studio (con el SDK de Android).

## 2. Desarrollo

```bash
npm install
npm start
```

Abre **http://localhost:4200**.

> Entra con el **admin inicial** que sembró el backend (por defecto `admin` / `admin123` —
> **cámbialo** en el `.env` del backend). Desde la app, un admin crea el resto de cuentas en **Usuarios**.

### Configurar la URL del servidor

- En el **login** pulsa **"cambiar"** y escribe la URL de tu API
  (ej. `http://192.168.1.50:8017` si el back está en otra máquina de la red).
- O más tarde en **Ajustes → Servidor (API)**.

## 3. Roles y permisos

| Rol          | Registrar / editar / borrar | Listar | Informe | Gestionar usuarios |
|--------------|:---:|:---:|:---:|:---:|
| **admin**       | ✔ | ✔ | ✔ | ✔ |
| **capturista**  | ✔ | ✔ | ✔ | — |
| **reportes**    | — | ✔ | ✔ | — |

La interfaz se adapta al rol (rutas protegidas con *guards*): a `reportes` se le ocultan la captura
y los botones de editar/borrar; solo `admin` ve **Usuarios**. La API manda: **401** (token vencido) →
te lleva al login; **403** (sin permiso) → aviso. El **rol se lee de `/auth/me`** tras el login.

## 4. Cómo funciona sin conexión

- El **service worker** (Angular `ngsw`) cachea la app (HTML/CSS/JS/iconos/FontAwesome) para que **abra sin internet**.
- Los **registros** se guardan en **IndexedDB**; se consultan offline.
- Registrar/editar/borrar **sin conexión** deja el cambio en una **cola** (verás el contador de pendientes arriba).
  Al volver la conexión, se **sincroniza automáticamente**.
- El service worker no cachea la API (otro origen); de eso se encarga la base local.
  Para el modo offline hay que haber iniciado sesión al menos una vez con conexión.

## 5. Compilar (producción)

```bash
npm run build
```

Genera la PWA en **`dist/mermas-mango/browser/`** (incluye `ngsw-worker.js` y `manifest.webmanifest`).

Para probar el build como PWA real (con service worker):

```bash
npx http-server dist/mermas-mango/browser -p 4300 -c-1
```

## 6. Generar el APK de Android (Capacitor)

Capacitor **empaqueta los archivos dentro del APK** (offline de verdad). Necesitas **Android Studio**.

```bash
# 1) Prepara el proyecto Android (una sola vez): compila y crea la carpeta android/
npm run apk:init

# 2) Abre el proyecto en Android Studio
npm run apk:open
```

En Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.
El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

Cada vez que cambies el código, resincroniza:

```bash
npm run apk:sync
```

> **Importante:** dentro del APK, la app **no** puede usar `127.0.0.1` (sería el propio teléfono).
> Apunta la URL del servidor (login → "cambiar" o Ajustes) a la **IP de tu servidor en la red**,
> ej. `http://192.168.1.50:8017`. El `capacitor.config.ts` usa esquema `https` para Android; si tu API
> es solo `http`, en `debug` Capacitor permite tráfico claro; para producción sirve la API por HTTPS.

## 7. Estructura

```
src/
  index.html                 Shell HTML (FontAwesome, manifest, theme-color)
  styles.scss                Tema verde global
  app/
    app.ts / app.config.ts / app.routes.ts
    core/
      models.ts              Tipos
      config.service.ts      URL base de la API
      auth.service.ts        Login JWT + rol desde /auth/me (signals)
      auth.interceptor.ts    Añade el token; 401 -> login
      db.service.ts          IndexedDB (cache + cola offline)
      api.service.ts         Cliente API con soporte offline
      network.service.ts     Señal de conexion (online/offline)
      toast.service.ts       Avisos
      guards.ts              authGuard / writeGuard / adminGuard
    shell/shell.component.ts  Topbar + sidebar + <router-outlet>
    pages/                    login, captura, registros, panel, informe, usuarios, ajustes
    shared/toasts.component.ts
public/
  fontawesome/               FontAwesome local (offline)
  icons/                     Iconos de la app (mango, verde)
  manifest.webmanifest       Manifiesto PWA
ngsw-config.json             Config del service worker (precache offline)
capacitor.config.ts          Config del APK (webDir = dist/mermas-mango/browser)
```

## 8. Scripts

| Comando | Qué hace |
|---------|----------|
| `npm start` | Servidor de desarrollo (http://localhost:4200) |
| `npm run build` | Compila la PWA a `dist/mermas-mango/browser` |
| `npm run mock` | Levanta una API de prueba en memoria (http://127.0.0.1:8000) |
| `npm run apk:init` | Compila y crea el proyecto Android |
| `npm run apk:sync` | Recompila y sincroniza el proyecto Android |
| `npm run apk:open` | Abre el proyecto en Android Studio |

## 9. Probar sin el backend (opcional)

Levanta la **API de prueba** (imita el contrato real: login, roles y `/auth/me`):

```bash
npm run mock          # queda en http://127.0.0.1:8000
```

En la app cambia el servidor a `http://127.0.0.1:8000` y entra con `admin` / `admin123`.

> El mock guarda todo en memoria y se borra al cerrarlo. Úsalo solo para desarrollo.
