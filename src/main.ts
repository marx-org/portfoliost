import { createApp } from "vue"
import { createPinia } from "pinia"
import ApexChart from "./components/ApexChart.vue"
import App from "./App.vue"
import router from "./router"
import { i18n } from "./i18n"
import { useThemeStore } from "@/stores/theme"
import { useAuthStore } from "@/stores/auth"
import { useLocaleStore } from "@/stores/locale"
import "./styles/main.css"

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(i18n)
// §48.6e B6 — the local wrapper (forwards options.chart.height to the
// vue3-apexcharts height prop, which the raw plugin clobbers with "auto").
app.component("apexchart", ApexChart)
useThemeStore(pinia).init()
// §77.5 — instantiate the auth store before mount so it can register the
// refresh handler. Child components' setup runs before App.vue's onMounted, so
// without this an early request could find no handler and a lapsed token would
// never be renewed.
useAuthStore(pinia)
// The persisted UI locale is applied to i18n synchronously at store creation;
// server reconciliation is deferred to App.vue's onMounted, after auth is ready
// (a startup getUserProfile would 401 before the token is set).
useLocaleStore(pinia)
app.mount("#app")
