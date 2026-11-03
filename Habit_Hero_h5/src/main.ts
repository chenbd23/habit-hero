import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import {syncFailure} from './composables/useAppData';

const app = createApp(App);
app.config.errorHandler = (error) => { syncFailure(error); };
app.use(router);
app.mount('#root');

