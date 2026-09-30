import { createApp } from "vue"
import { createPinia } from "pinia"
import ApexChart from "./components/ApexChart.vue"
import App from "./App.vue"
import router from "./router"
import { useThemeStore } from "@/stores/theme"
import { useAuthStore } from "@/stores/auth"
import "./styles/main.css"

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
// §48.6e B6 — the local wrapper (forwards options.chart.height to the
// vue3-apexcharts height prop, which the raw plugin clobbers with "auto").
app.component("apexchart", ApexChart)
useThemeStore(pinia).init()
// §77.5 — instantiate the auth store before mount so it can register the
// refresh handler. Child components' setup runs before App.vue's onMounted, so
// without this an early request could find no handler and a lapsed token would
// never be renewed.
useAuthStore(pinia)
app.mount("#app")
