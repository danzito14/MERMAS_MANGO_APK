import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mermas.mango',
  appName: 'Mermas Mango',
  // Salida del build de Angular (application builder).
  webDir: 'dist/mermas-mango/browser',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0f5c2b',
  },
  plugins: {
    // Hace las peticiones HTTP de forma NATIVA en el APK: evita el CORS y el
    // bloqueo de tráfico. En el navegador (web, mismo dominio) no aplica y usa fetch normal.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
