import { createRouter, createWebHistory } from "vue-router"
import { useAuthStore } from "@/stores/auth"

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/en/investments",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/modules/auth/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/en",
      component: () => import("@/layout/AppLayout.vue"),
      meta: { requiresAuth: true },
      children: [
        {
          path: "investments",
          name: "investments",
          component: () => import("@/modules/portfolios/InvestmentsView.vue"),
        },
        {
          path: "investments/transactions",
          name: "transactions",
          component: () => import("@/modules/portfolios/TransactionsView.vue"),
        },
        {
          path: "investments/watchlist",
          name: "watchlist",
          component: () => import("@/modules/watchlists/WatchlistsView.vue"),
        },
        {
          path: "wallets",
          name: "wallets",
          component: () => import("@/modules/wallets/WalletsView.vue"),
        },
        {
          path: "portfolios/:id",
          name: "portfolio-detail",
          component: () => import("@/modules/portfolios/PortfolioDetailView.vue"),
        },
        {
          path: "research/:symbol",
          component: () => import("@/modules/instruments/ResearchView.vue"),
          redirect: (to) => ({ name: "research-overview", params: to.params }),
          children: [
            {
              path: "overview",
              name: "research-overview",
              component: () => import("@/modules/instruments/ResearchOverview.vue"),
            },
            {
              path: "news",
              name: "research-news",
              component: () => import("@/modules/instruments/ResearchNews.vue"),
            },
            {
              path: "investor-relations",
              name: "research-ir",
              component: () => import("@/modules/instruments/ResearchInvestorRelations.vue"),
            },
            {
              path: "projections",
              name: "research-projections",
              component: () => import("@/modules/instruments/ResearchProjections.vue"),
            },
          ],
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/en/investments",
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } }
  }
  if (to.name === "login" && auth.isAuthenticated) {
    return { name: "investments" }
  }
  return true
})

export default router
