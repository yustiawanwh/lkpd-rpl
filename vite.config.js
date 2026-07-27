import { defineConfig } from 'vite'

// base: penting bila aplikasi ditayangkan di subfolder, seperti GitHub Pages
// (contoh alamat: https://nama-anda.github.io/nama-repo/).
// Nilainya diisi otomatis oleh GitHub Actions lewat variabel VITE_BASE.
// Bila kosong (mis. saat menayangkan di Netlify/Vercel atau domain sendiri),
// otomatis memakai '/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
})
