# Mermas Mango

App **Angular 20** para el control de mermas de mango por lote: registro, consulta e informes,
con **login por roles** y **funcionamiento sin conexión**. Es una **PWA** instalable y se puede
empaquetar como **APK de Android**.

- Tema **verde**, sin emojis, iconos **FontAwesome** (locales, funcionan offline).
- **Pantalla principal de captura:** línea `L1–L4`, lote (solo números), tipo de merma,
  cantidad (0–100 kg, 2 decimales), **Subir** e interruptor **"mantener datos del lote"**.
- **Roles** (JWT 12 h): `admin`, `capturista`, `reportes`.
- **Offline:** los datos se guardan en el dispositivo (IndexedDB) y se **sincronizan solos** al reconectar.

> El código está en **[`mermas-mango/`](mermas-mango/)**. La documentación completa
> (desarrollo, build, PWA, APK, estructura) está en **[mermas-mango/README.md](mermas-mango/README.md)**.

## Inicio rápido

```bash
cd mermas-mango
npm install
npm start          # http://localhost:4200
```

Entra con el admin inicial del backend (`admin` / `admin123`; cámbialo en el `.env`).
Si tu API no está en `http://127.0.0.1:8017`, pulsa **"cambiar"** en el login o ve a **Ajustes**.

## Generar el APK (Capacitor)

```bash
cd mermas-mango
npm run apk:init   # compila + crea android/ (requiere Android Studio)
npm run apk:open   # Build > APK en Android Studio
```

> En el APK apunta el servidor a la **IP de tu red** (ej. `http://192.168.1.50:8017`), no a `127.0.0.1`.

## Probar sin backend

```bash
cd mermas-mango
npm run mock       # API de prueba en http://127.0.0.1:8000 (admin/admin123)
```
