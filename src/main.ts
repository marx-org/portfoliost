import { createApp } from "vue"
import { createPinia } from "pinia"
import VueApexCharts from "vue3-apexcharts"
import App from "./App.vue"
import router from "./router"
import { useThemeStore } from "@/stores/theme"
import "./styles/main.css"

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(VueApexCharts)
useThemeStore(pinia).init()
app.mount("#app")
