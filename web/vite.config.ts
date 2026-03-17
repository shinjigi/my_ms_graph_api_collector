import { defineConfig }    from 'vite';
import vue                  from '@vitejs/plugin-vue';
import tailwindcss          from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        vue(),
    ],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target:       'http://localhost:3001',
                changeOrigin: true,
            },
        },
    },
});
