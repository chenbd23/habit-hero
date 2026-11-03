import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,'.','');
  return {plugins:[vue()],server:{port:4319,host:'127.0.0.1',proxy:{'/api/v1':{target:env.SYNC_SERVER_URL||'http://127.0.0.1:4318',changeOrigin:true},'/healthz':{target:env.SYNC_SERVER_URL||'http://127.0.0.1:4318',changeOrigin:true}}},resolve:{alias:{'@':path.resolve(__dirname,'.')}}};
});
