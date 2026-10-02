import { createRouter, createWebHistory } from "vue-router"
import { useAuthStore } from "@/stores/auth"

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      // §84 — the account-level summary (`Konto`) is the landing page. The
      // redirect is a path, not a name, so it cannot drift from the route below.
      path: "/",
      redirect: "/en/investments/accounts-balance",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/modules/auth/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/auth/callback",
      name: "auth-callback",
      component: () => import("@/modules/auth/AuthCallback.vue"),
      meta: { public: true },
    },
    {
      // §77.4 — the OIDC client's `logoutCallbackUrls` advertises this path, so
      // Pocket-ID redirects here after end-session. It has to be a real route:
      // before this existed, completing a logout bounced the browser straight
      // back into the dashboard.
      path: "/logout",
      name: "logout",
      component: () => import("@/modules/auth/LogoutView.vue"),
      meta: { public: true },
    },
    {
      path: "/public/portfolio/:shareId",
      name: "public-share",
      component: () => import("@/modules/settings/PublicPortfolioView.vue"),
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
          // §84 — new tab, first in the strip, and the `/` landing page.
          // `/en/investments` stays a working route, so no deep link breaks.
          path: "investments/accounts-balance",
          name: "accounts-balance",
          component: () => import("@/modules/portfolios/AccountsBalanceView.vue"),
        },
        {
          path: "investments/transactions",
          name: "transactions",
          component: () => import("@/modules/portfolios/TransactionsView.vue"),
        },
        {
          path: "investments/transactions/cash",
          name: "transactions-cash",
          component: () => import("@/modules/portfolios/CashTransactionsView.vue"),
        },
        {
          path: "investments/watchlist",
          name: "watchlist",
          component: () => import("@/modules/watchlists/WatchlistsView.vue"),
        },
        {
          path: "charting",
          name: "charting",
          component: () => import("@/modules/charting/ChartingView.vue"),
        },
        {
          path: "settings",
          component: () => import("@/modules/settings/SettingsView.vue"),
          redirect: { name: "settings-profile" },
          children: [
            {
              path: "profile",
              name: "settings-profile",
              component: () => import("@/modules/settings/ProfileView.vue"),
            },
            {
              path: "shared-portfolios",
              name: "settings-shared-portfolios",
              component: () => import("@/modules/settings/SharedPortfoliosView.vue"),
            },
            {
              path: "broker-connections",
              name: "settings-broker-connections",
              component: () => import("@/modules/settings/BrokerConnectionsView.vue"),
            },
          ],
        },
        {
          path: "portfolios/:id",
          name: "portfolio-detail",
          component: () => import("@/modules/portfolios/PortfolioDetailView.vue"),
          redirect: (to) => ({ name: "portfolio-holdings", params: to.params }),
          children: [
            {
              path: "holdings",
              name: "portfolio-holdings",
              component: () => import("@/modules/portfolios/PortfolioHoldingsTab.vue"),
            },
            {
              path: "cash",
              name: "portfolio-cash",
              component: () => import("@/modules/portfolios/PortfolioCashTab.vue"),
            },
            {
              path: "transactions",
              name: "portfolio-transactions",
              component: () => import("@/modules/portfolios/PortfolioTransactionsTab.vue"),
            },
            {
              path: "performance",
              name: "portfolio-performance",
              component: () => import("@/modules/portfolios/PortfolioPerformanceTab.vue"),
            },
            {
              path: "analytics",
              redirect: (to) => ({ name: "portfolio-performance", params: { id: to.params.id } }),
            },
            {
              path: "allocation",
              name: "portfolio-allocation",
              component: () => import("@/modules/portfolios/PortfolioAllocationTab.vue"),
            },
            {
              path: "risk-analysis",
              name: "portfolio-risk-analysis",
              component: () => import("@/modules/portfolios/PortfolioRiskTab.vue"),
            },
            {
              path: "risk",
              redirect: (to) => ({ name: "portfolio-risk-analysis", params: { id: to.params.id } }),
            },
            {
              path: "dividends",
              name: "portfolio-dividends",
              component: () => import("@/modules/portfolios/PortfolioDividendsTab.vue"),
            },
            {
              path: "calendar",
              name: "portfolio-calendar",
              component: () => import("@/modules/portfolios/PortfolioCalendarTab.vue"),
            },
            {
              path: "news",
              name: "portfolio-news",
              component: () => import("@/modules/portfolios/PortfolioNewsTab.vue"),
            },
            {
              path: "compare",
              name: "portfolio-compare",
              component: () => import("@/modules/portfolios/PortfolioCompareTab.vue"),
            },
          ],
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
              path: "fundamentals",
              name: "research-fundamentals",
              component: () => import("@/modules/instruments/ResearchFundamentals.vue"),
            },
            {
              path: "investor-relations",
              name: "research-ir",
              component: () => import("@/modules/instruments/ResearchInvestorRelations.vue"),
            },
            {
              path: "investor-relations/:eventId",
              name: "research-ir-transcript",
              component: () => import("@/modules/instruments/ResearchInvestorRelationsTranscript.vue"),
            },
            {
              path: "ownership",
              name: "research-ownership",
              component: () => import("@/modules/instruments/ResearchOwnership.vue"),
            },
            {
              path: "projections",
              name: "research-projections",
              component: () => import("@/modules/instruments/ResearchProjections.vue"),
            },
            {
              path: "compare",
              name: "research-compare",
              component: () => import("@/modules/instruments/ResearchCompare.vue"),
            },
            {
              path: "calendar",
              name: "research-calendar",
              component: () => import("@/modules/instruments/ResearchCalendar.vue"),
            },
            {
              path: "dividends",
              name: "research-dividends",
              component: () => import("@/modules/instruments/ResearchDividends.vue"),
            },
          ],
        },
        {
          path: "admin",
          component: () => import("@/modules/admin/AdminLayout.vue"),
          redirect: { name: "admin-system" },
          meta: { admin: true },
          children: [
            {
              path: "system",
              name: "admin-system",
              component: () => import("@/modules/admin/SystemInfoView.vue"),
              meta: { admin: true },
            },
            {
              path: "currencies",
              name: "admin-currencies",
              component: () => import("@/modules/admin/CurrencyRatesView.vue"),
              meta: { admin: true },
            },
            {
              path: "users",
              name: "admin-users",
              component: () => import("@/modules/admin/UsersView.vue"),
              meta: { admin: true },
            },
            {
              path: "jobs",
              name: "admin-jobs",
              component: () => import("@/modules/admin/JobsView.vue"),
              meta: { admin: true },
            },
            {
              path: "market-data",
              name: "admin-market-data",
              component: () => import("@/modules/admin/MarketDataView.vue"),
              meta: { admin: true },
            },
            {
              path: "bond-catalogue",
              name: "admin-bond-catalogue",
              component: () => import("@/modules/admin/BondCatalogueView.vue"),
              meta: { admin: true },
            },
            {
              path: "topology",
              name: "admin-topology",
              component: () => import("@/modules/admin/TopologyView.vue"),
              meta: { admin: true },
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
  if (to.meta.admin && !auth.isAdmin) {
    return { name: "investments" }
  }
  if (to.name === "login" && auth.isAuthenticated) {
    return { name: "investments" }
  }
  return true
})

export default router
