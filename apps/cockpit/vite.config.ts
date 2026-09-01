import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Port kann per Env injiziert werden (Dev-Harness vergibt bei belegtem 5173 einen
// freien Port); ohne Env bleibt der Standard 5173.
const envPort = Number(process.env.PORT)
const port = Number.isInteger(envPort) && envPort > 0 ? envPort : 5173

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  server: {
    port,
    // Nur wenn ein Port vorgegeben wurde, darf Vite nicht ausweichen — sonst
    // liefe der Server auf einem anderen Port als der Aufrufer erwartet.
    strictPort: port !== 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
