import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { initTheme } from './composables/useTheme'
import './styles.css'

initTheme()

registerSW({ immediate: true })

createApp(App).mount('#app')
