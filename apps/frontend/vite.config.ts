import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Retain hashed chunks so open demo tabs survive a build during development.
export default defineConfig({plugins:[react()],build:{emptyOutDir:false},server:{proxy:{'/api':{target:'http://127.0.0.1:8000',ws:true}}}});
