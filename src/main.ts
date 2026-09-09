import { createApp } from 'vue';
import { registerPlugins } from '@/plugins';
import App from './App.vue';
import 'driver.js/dist/driver.css';
import '@/styles/tour.css';

const app = createApp(App);

registerPlugins(app);

app.mount('#app');
