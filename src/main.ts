import { createApp } from "vue"
import { createPinia } from "pinia"
import ApexChart from "./components/ApexChart.vue"
import App from "./App.vue"
import router from "./router"
import { useThemeStore } from "@/stores/theme"
import "./styles/main.css"

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
// §48.6e B6 — the local wrapper (forwards options.chart.height to the
// vue3-apexcharts height prop, which the raw plugin clobbers with "auto").
app.component("apexchart", ApexChart)
useThemeStore(pinia).init()
app.mount("#app")
