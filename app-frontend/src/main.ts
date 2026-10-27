import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';
import { vDialog } from './directives/dialog';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('dialog', vDialog);
app.mount('#app');
