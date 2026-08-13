# Example service.ai - Stock Portfolio Application Inventory

**Date:** August 8, 2026  
**Application URL:** https://app.example-service.ai  
**Language:** English/Polish  

---

## 1. EXECUTIVE SUMMARY

Example service.ai is a comprehensive stock portfolio management and investment research platform. It enables users to:
- Track multiple investment portfolios (stocks, ETFs, crypto)
- Manage cash wallets
- Research stocks with fundamental data
- Analyze portfolio performance and risk
- View real-time news and alerts
- Compare portfolios and peer analysis (premium)

**Key Components:**
- Authentication (login/register)
- Portfolio Management (create, edit, delete portfolios)
- Holdings Management (add/remove positions)
- Transaction Tracking
- Research Tools (fundamentals, news, projections)
- Analytics & Charting
- Settings & Preferences

---

## 2. APPLICATION ARCHITECTURE

### 2.1 Main Navigation Structure

**Sidebar Navigation (Fixed Left Panel):**
1. **Example service Logo** - Returns to /en/investments (home)
2. **Portfolios / Watchlists** - Portfolio overview & watchlist management
3. **Research** - Stock research & analysis tools
4. **Charting** - Multi-stock comparison charts
5. **News** - News dashboard
6. **Alerts** (button) - Notification center
7. **Logout** (button)
8. **Settings** (link) - User preferences
9. **Report Bug** (button)

**Copilot Button** - Floating AI assistant button (bottom right)

### 2.2 Main Sections

---

## 3. DETAILED PAGE DOCUMENTATION

### 3.1 LOGIN PAGE
**URL:** `/en/login`  
**Title:** "Log In - Example service.ai"  
**Authentication Type:** Email/Password with optional Google OAuth  

**Components:**
- Email input field
- Password input field
- "Remember me" checkbox
- "Forgot password?" link
- "Sign In" button (HTML submit)
- "Sign in with Google" button
- "Don't have an account? Create one" link

**Key Features:**
- Form validation (button disabled until both fields valid)
- Credential persistence option
- Password recovery flow
- Social login alternative

---

### 3.2 INVESTMENTS / PORTFOLIOS PAGE
**URL:** `/en/investments`  
**Title:** "Investments - Example service.ai"  

**Layout:**
```
├── Header Section
│   └── Currency Selector (USD $ default)
├── Summary Cards (Investment Portfolios)
│   ├── Total Value: $109,916.76
│   ├── Total Invested: $98,083.40
│   └── Total Return: +12.06%
├── Summary Cards (Cash Portfolios)
│   ├── Total Balance: $1,916.60
│   └── Currency Breakdown (USD 100%)
├── Navigation Tabs
│   ├── Portfolios (active)
│   ├── Transactions
│   └── Watchlists
├── "Import from Broker" Button
├── Portfolio Cards Section
│   ├── "Create Investment Portfolio" Button
│   └── Portfolio Card: "Top10"
│       ├── Value: $109,916.76
│       ├── Strategy: Growth
│       ├── Description: "Top10 big US stocks with best growth potential..."
│       ├── Invested Amount: $100,000.00
│       ├── Total Return: +12.06%
│       ├── Time Period Buttons (1D, 1W, 1M, 3M, 6M, 1Y, ALL)
│       ├── Daily Change: +$3,576.36 (+3.36%)
│       ├── Positions Count: 10
│       └── Action Buttons
│           ├── Add Position
│           ├── Analytics
│           ├── News
│           ├── Calendar
│           └── Manage
├── Cash Wallet Section
│   ├── "Create Cash Wallet" Button
│   └── Wallet Card: "Portfel USD 1"
│       ├── Balance: $1,916.60
│       ├── Currency: USD
│       ├── Available: $1,916.60
│       └── Action Buttons
│           ├── Deposit
│           ├── Withdraw
│           ├── Transfer
│           ├── History
│           └── Manage
└── Premium Feature: AI Insights
    └── "See what moved your portfolio" (upgrade required)
```

**Portfolio Card Action Buttons:**
- **Add Position** - Opens add position dialog (stock/ETF/crypto/option/CFD)
- **Analytics** - Opens analytics/insights for portfolio (may be premium)
- **News** - Shows news feed for portfolio stocks
- **Calendar** - Shows earnings/dividend calendar (premium feature)
- **Manage** - Portfolio settings/options menu

**Key Features:**
- Multi-currency support (USD default)
- Portfolio creation
- Broker import functionality
- Time-period filtering (1D to ALL)
- Quick access to portfolio tools via card buttons
- AI-powered insights (premium feature, $9.99/mo)

---

### 3.3 PORTFOLIO DETAILS - HOLDINGS
**URL:** `/en/portfolios/{id}`  
**Title:** "Holdings - Example service.ai"  

**Header Section:**
- "Go back" button
- Portfolio name with "Rename" button
- Summary metrics:
  - Total Value: $109,916.76
  - Invested: $98,083.40
  - Return: +12.06%
  - Unrealized: +$11,833.36
  - Realized: $0.00
  - Income: +$0.00
- Currency selector
- "Share" button
- "Add Position" button
- "Delete" button

**Tab Navigation:**
1. **Holdings** (current)
2. **Transactions**
3. **Performance**
4. **Allocation**
5. **Risk Analysis**
6. **Dividends**
7. **Calendar** (premium - locked)
8. **News**
9. **Compare**

**Holdings Table:**
- Columns: Symbol | Qty | Avg Cost | Price | Market Value | Gain/Loss | Gain/Loss % | Weight
- Each row includes: Company name, Logo, Market (US), Asset type (Stock)
- Example positions:
  - AMAT: 15 units @ $505.97 avg → $539.14 current (7.36% weight, +6.56% gain)
  - CART: 239 units @ $43.31 avg → $50.17 current (10.91% weight, +15.85% gain)
  - MSFT: 32 units @ $461.91 avg → $499.99 current (14.56% weight, +8.24% gain)
  - NVDA: 64 units @ $198.95 avg → $223.96 current (13.04% weight, +12.57% gain)

**Features:**
- Column customization (export 7 columns option)
- Column filtering/removal
- Row click to view position details
- Position actions menu (edit, delete, etc.)
- Export functionality

---

### 3.4 PORTFOLIO DETAILS - TRANSACTIONS
**URL:** `/en/portfolios/{id}/transactions`  
**Title:** "Transactions - Example service.ai"  

**Features:**
- Historical transaction list
- Transaction types: Buy, Sell, Dividend, etc.
- Date, amount, price tracking
- Export options

---

### 3.5 PORTFOLIO DETAILS - PERFORMANCE
**URL:** `/en/portfolios/{id}/performance`  
**Title:** "Performance - Example service.ai"  

**Features:**
- Performance charts
- Time period filters
- Benchmark comparison
- Return calculations

---

### 3.6 PORTFOLIO DETAILS - ALLOCATION
**URL:** `/en/portfolios/{id}/allocation`  
**Title:** "Allocation - Example service.ai"  

**Features:**
- Pie/donut charts showing portfolio allocation
- Sector breakdown
- Asset type breakdown
- Geographic allocation (if applicable)

---

### 3.7 PORTFOLIO DETAILS - RISK ANALYSIS
**URL:** `/en/portfolios/{id}/risk-analysis`  
**Title:** "Risk Analysis - Example service.ai"  

**Features:**
- Beta calculations
- Volatility metrics
- Sharpe ratio
- Maximum drawdown
- Value at Risk (VaR)
- Risk indicators

---

### 3.8 PORTFOLIO DETAILS - DIVIDENDS
**URL:** `/en/portfolios/{id}/dividends`  
**Title:** "Dividends - Example service.ai"  

**Features:**
- Dividend history
- Upcoming dividends
- Yield calculations
- Dividend payments summary

---

### 3.9 PORTFOLIO DETAILS - TRANSACTIONS (Detailed)
**URL:** `/en/portfolios/{id}/transactions`  
**Title:** "Transactions - Example service.ai"  

**Filters & Controls:**
- **Date Range:** Preset buttons (1M, 3M, 6M, YTD, 1Y, 2Y, 5Y, ALL)
- **Type:** Dropdown (All Types, Buy, Sell, Dividend, etc.)
- **Symbol:** Text search field
- **Transaction Amount Range:** Min/max dollar spinbuttons
- **Reset Button:** Clear all filters

**Summary Metrics:**
- Total Bought: (10) $98,083.40
- Total Sold: (0) $0.00
- Dividends: (0) $0.00
- Realized Gain/Loss (overall): $0.00
- Total Fees: (10) $0.00

**Portfolio Value & Transactions Chart:**
- Expandable/collapsible chart
- Shows portfolio value timeline with buy/sell transaction markers
- Shows quantity of transactions overlaid (e.g., "Buy (1)")
- Buttons: Expand, Show/hide chart

**Transactions Table:**
- Columns: Symbol | Date | Type | Quantity | Price | Instrument Currency | Fees | Amount | P&L | (Actions)
- Sortable columns (Date ↓ by default)
- Pagination: "1-10 of 10" display
- Rows per page: 10, 20, 50, 100, All
- Page buttons: First, Previous, [1], Next, Last

**Per Transaction Row Actions:**
- **Edit transaction** button (pencil icon) → Opens "Edit {Type} Transaction" dialog
- **Delete transaction** button (trash icon) → Confirmation dialog

**Edit Transaction Dialog (Example: Buy):**
- Dialog title: "Edit Buy Transaction"
- Stock header: Logo, Symbol (KLAC), Type (Stock), Company name (KLA Corp)
- Price display: "$181.77" with "View chart" button, "Historical Price (Aug 2, 2026)" label
- **Purchase Date:** Date picker (Aug 2, 2026)
- **Cash portfolio:** Dropdown (Portfel USD 1 - $1,916.60)
- **Quantity × Price per share ($):** Spinbuttons (42 × $181.765)
- **Transaction Fees:** Dollar/percentage toggle, spinbutton input
- **Total Cost:** Display (calculated, $7,634.13)
- Cancel / Save buttons

### 3.10 INVESTMENTS - TRANSACTIONS (Global)
**URL:** `/en/investments/transactions`  
**Title:** "Transactions - Example service.ai"  

**Features:**
- All transactions across all portfolios
- Same filter, summary, chart, and table structure as portfolio-specific
- Can filter by portfolio via Type/Symbol filters
- Export functionality

---

### 3.10 WATCHLISTS
**URL:** `/en/investments/watchlist`  
**Title:** "Watchlist - Example service.ai"  

**Features:**
- Create watchlists
- Add stocks to watchlists
- View watchlist performance
- Track price alerts

---

### 3.11 RESEARCH - STOCK OVERVIEW
**URL:** `/en/research/{symbol}/overview`  
**Title:** "Overview | {SYMBOL} - Example service.ai"  
**Example:** `/en/research/AAPL.US/overview`

**Header Section:**
- "Go back" button
- Search button ("Search for a stock... ⌘ K")
- "Add to Watchlist" button
- Stock ticker & company name
- Current price ($313.20 for AAPL)
- Quick stock navigation (MSFT, NVDA, META, PLTR, CART, INTU, KLAC, ORCL, AMAT, LRCX buttons)

**Tab Navigation:**
1. **Overview** (current)
2. **News**
3. **Fundamentals** (premium - locked)
4. **Investor Relations**
5. **Ownership** (premium - locked)
6. **Projections**
7. **Compare** (premium - locked)
8. **Calendar** (premium - locked)
9. **Dividends** (premium - locked)

**Overview Content:**
- Company logo & overview section
  - Company description (Wikipedia-style)
  - "Show more" button for full description
  - Basic info:
    - Name: Apple Inc
    - CEO: "-" (not filled)
    - Sector: Technology
    - Year Founded: 1980
    - Employees: 166,000
    - Website: www.apple.com (clickable link)

- **EPS Surprises Chart**
  - Dropdown for time period (5Q default)
  - Visual representation of earnings surprises

- **Company Statistics Section:**
  - **Profile Metrics:**
    - Market Cap: $4.60T
    - EV: $4.62T
    - Shares Outstanding: 14.69B
    - Revenue: $466.82B
    - Employees: 166.0K
  
  - **Margins:**
    - Gross: 48.6%
    - EBITDA: 36.0%
    - Operating: 33.2%
    - Pre-Tax: 33.4%
    - Net: 27.6%
    - FCF: 29.3%
  
  - **Returns (TTM):**
    - ROA: 36.1%
    - (Additional metrics)

---

### 3.12 RESEARCH - STOCK NEWS
**URL:** `/en/research/{symbol}/news`  
**Title:** "News | {SYMBOL} - Example service.ai"  

**Features:**
- News feed for specific stock
- Date filtering
- Source information
- Article links

---

### 3.13 RESEARCH - INVESTOR RELATIONS
**URL:** `/en/research/{symbol}/investor-relations`  
**Title:** "Investor Relations | {SYMBOL} - Example service.ai"  

**Features:**
- SEC filings
- Earnings reports
- Press releases
- Corporate events

---

### 3.14 RESEARCH - PROJECTIONS
**URL:** `/en/research/{symbol}/projections`  
**Title:** "Projections | {SYMBOL} - Example service.ai"  

**Features:**
- Analyst price targets
- Revenue projections
- EPS forecasts
- Growth estimates

---

### 3.15 CHARTING / COMPARISON
**URL:** `/en/charting`  
**Title:** "Charting - Example service.ai"  

**Layout:**
```
├── Header
│   ├── Title: "Charting"
│   └── Description: "Select stocks to compare their fundamentals"
├── Selection Panel
│   ├── Stocks selected counter: "0/10 selected"
│   ├── "Add stock" button
│   └── Popular Comparisons
│       ├── Tech Giants
│       ├── Social Media
│       ├── EVs
│       ├── Banks
│       └── Streaming
└── Comparison Chart Area
    └── (Empty until stocks selected)
```

**Features:**
- Multi-stock selection (max 10)
- Pre-built comparison categories
- Fundamental comparison (not technical)
- Stock search integration
- Visual comparison tools

---

### 3.16 NEWS DASHBOARD
**URL:** `/en/news-dashboard`  
**Title:** "News - Example service.ai"  

**Features:**
- Aggregate financial news feed
- Filter by portfolio stocks
- Filter by sector
- Real-time updates
- Source attribution

---

### 3.17 SETTINGS - PROFILE
**URL:** `/en/settings/profile`  
**Title:** "Profile - Example service.ai"  

**Settings Tabs:**
1. **Profile** (current)
2. **Shared Portfolios**
3. **Broker Connections** (skipped)
4. **Alerts** (Notifications)
5. **Billing** (skipped)

**Profile Section:**
- Profile settings heading
- First Name input
- Last Name input
- (Additional profile fields)

**Footer Links:**
- Terms (external)
- Privacy (external)
- Roadmap (external)

---

### 3.18 SETTINGS - SHARED PORTFOLIOS
**URL:** `/en/settings/shared-portfolios`  
**Title:** "Shared Portfolios - Example service.ai"  

**Features:**
- View shared portfolio access
- Share portfolios with other users
- Manage permissions
- Collaboration features

---

### 3.19 SETTINGS - ALERTS/NOTIFICATIONS
**URL:** `/en/settings/notifications`  
**Title:** "Alerts - Example service.ai"  

**Features:**
- Email notification preferences
- Alert types:
  - Price alerts
  - Portfolio changes
  - Dividend announcements
  - News alerts
  - System notifications
- Frequency settings
- Channel preferences (email, in-app, etc.)

---

## 4. INTERACTIVE FORMS & DIALOGS

### 4.1 Add Position Dialog
**Trigger:** "Add Position" button on portfolio page  
**Position Types:**
1. **Stock, ETF or crypto**
   - Search dialog: "Search stocks, ETFs, crypto, or paste an ISIN..."
   - Filter by Type button
   - Popular searches: AAPL, GOOGL, MSFT, AMZN, TSLA, SPY, QQQ
   - Dynamic search results based on ticker/name input
   - Form fields (after selection):
     - Symbol (pre-filled from search)
     - Quantity
     - Average cost / Purchase price
     - Date of purchase
     - Commission (optional)

2. **Option**
   - Description: "Pick the underlying, then describe the contract"
   - Fields for underlying stock
   - Strike price
   - Expiration date
   - Call/Put selection
   - Quantity

3. **CFD**
   - Description: "A leveraged position, entered by hand"
   - Symbol/underlying
   - Quantity
   - Entry price
   - Leverage ratio
   - Stop loss (optional)

### 4.2 Position Actions Menu
**Trigger:** Three dots button in Holdings table (right side of each position row)  
**Menu Options:**
1. **Sell** - Opens sell dialog
2. **Dividend** - Record dividend payment
3. **Edit position** - Opens edit position form
4. **Research** - Navigate to stock research page
5. **Remove position** - Delete position with confirmation

**Sell Form:**
- Symbol, Company name, Current price display
- Owned quantity: 15 (example: AMAT)
- Avg Cost: $505.97
- Total Cost: $7,589.47
- Current Value: $8,087.10
- **Quantity to Sell:** spinbutton with "50%" and "All" buttons
- **Sell Date:** Date picker (default today)
- **Tax Lot Method:** Dropdown (FIFO default)
- **Sell Price:** Per share spinbutton (pre-filled with current price)
- **Transaction Fees:** Dollar or percentage input
- **Summary:** Net Proceeds, Profit/Loss display
- Cancel / Sell buttons

**Dividend Form:**
- Position display (symbol, shares held)
- Toggle: "Total Amount" or "Per Share"
- **Cash portfolio:** Dropdown selector (e.g., Portfel USD 1 - $1,916.60)
- **Gross Dividend Amount:** Dollar spinbutton
- **Withholding Tax:** Dollar spinbutton
- **Date received:** Date picker
- **Notes (optional):** Text field (placeholder: "e.g., Q4 2024 dividend")
- Summary: Gross Dividend, Withholding Tax, Net Amount
- Cancel / "Enter a dividend amount" button (disabled until amount entered)

**Edit Position Form:**
- Inline editing with auto-save on blur
- Transaction history table showing all buys/sells/dividends
- Columns: Date, Type, Quantity, Price per share, Transaction Fees, Exchange Rate, Total Cost
- Each row has delete button
- Can add new transactions via bottom row with Type dropdown (Buy, Sell, etc.)
- Cash wallet balance displayed at top
- Warning: "Changes save when you leave a field"

**Remove Position Confirmation:**
- Dialog: "Remove position?"
- Warning text: "This permanently deletes [SYMBOL] and all of its transactions from this portfolio. Cash those trades moved is returned to the linked cash wallet where possible. This cannot be undone."
- Cancel / Delete buttons

### 4.3 Transactions Tab - Transaction Actions
**Location:** Portfolio → Transactions tab  
**Per Transaction (table row):**
- **Edit transaction** button (pencil icon) - Opens "Edit {Type} Transaction" dialog
- **Delete transaction** button (trash icon) - Shows confirmation before delete

**Delete Transaction Confirmation Dialog:**
- Dialog title: "Delete Transaction"
- Message: "Are you sure you want to delete this transaction? This action cannot be undone."
- Buttons: Cancel / Delete
- Simple confirmation (shorter than portfolio delete warning)

### 4.4 Cash Wallet - Deposit Form
**Trigger:** "Deposit" button on cash wallet  
**Fields:**
- Amount input
- Currency selector
- Bank account selection
- Reference/memo (optional)
- Submit button

### 4.4b Cash Wallet - Withdraw Form
**Trigger:** "Withdraw" button on cash wallet  
**Fields:**
- Amount input
- Destination bank account selector
- Reference/memo (optional)
- Submit button

### 4.4c Cash Wallet - Transfer Form
**Trigger:** "Transfer" button on cash wallet  
**Fields:**
- Amount input
- Source wallet selector
- Destination wallet selector (another cash wallet)
- Reference/memo (optional)
- Submit button

### 4.4d Cash Wallet - History
**Trigger:** "History" button on cash wallet  
**Features:**
- Transaction history (deposits, withdrawals, transfers)
- Date filtering
- Transaction type display
- Amount and status info
- Export options

### 4.4e Cash Wallet - Manage Menu
**Trigger:** "Manage" button on cash wallet  
**Options:** (Not yet documented - needs exploration)
- Likely options: Rename, Delete, Settings
- Currently not implemented or hidden

### 4.5 Stock Search Modal
**Trigger:** Search box in research pages  
**Keyboard Shortcut:** ⌘ K  
**Features:**
- Real-time search as user types
- Filter by instrument type
- Popular searches (AAPL, GOOGL, etc.)
- Search history
- Recent viewings
- Quick navigation to stock overview

### 4.6 Portfolio Deletion Confirmation
**Trigger:** "Delete" button on portfolio header  
**Dialog:** "Delete Portfolio?"
**Warning Text:**
- "Are you sure you want to delete this portfolio?"
- Display: "10 active position(s) will be deleted"
- "All positions and their transaction history will be permanently removed"
- "This action cannot be undone. All portfolio history and transactions will be permanently deleted."
- "Its wallet and cash history (deposits, withdrawals) will be deleted too, unless the wallet is shared with another portfolio."
- Cancel / Delete Portfolio buttons

---

## 5. DATA STRUCTURES & KEY ENTITIES

### 5.1 Portfolio
```json
{
  "id": "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2",
  "name": "Top10",
  "strategy": "Growth",
  "description": "Top10 big US stocks with best ghrowth potential, rebalanced monthly",
  "totalValue": 109916.76,
  "investedAmount": 100000.00,
  "totalReturn": 0.1206,
  "unrealizedGain": 11833.36,
  "realizedGain": 0.00,
  "income": 0.00,
  "currency": "USD",
  "positionCount": 10,
  "dailyChange": 3576.36,
  "dailyChangePercent": 0.0336
}
```

### 5.2 Position
```json
{
  "symbol": "AMAT",
  "company": "Applied Materials Inc",
  "market": "US",
  "type": "Stock",
  "quantity": 15,
  "avgCost": 505.97,
  "currentPrice": 539.14,
  "marketValue": 8087.10,
  "costBasis": 7589.48,
  "gainLoss": 497.63,
  "gainLossPercent": 0.0656,
  "weight": 0.0736
}
```

### 5.3 Stock (Research)
```json
{
  "symbol": "AAPL",
  "name": "Apple Inc",
  "currentPrice": 313.20,
  "sector": "Technology",
  "founded": 1980,
  "employees": 166000,
  "website": "www.apple.com",
  "marketCap": "4.60T",
  "enterpriseValue": "4.62T",
  "revenue": "466.82B",
  "metrics": {
    "grossMargin": 0.486,
    "ebitdaMargin": 0.360,
    "operatingMargin": 0.332,
    "netMargin": 0.276,
    "roa": 0.361
  }
}
```

---

## 6. PREMIUM FEATURES (Locked)

1. **AI Portfolio Insights** - $9.99/month
   - "See what moved your portfolio"
   - Daily drivers analysis
   
2. **Fundamentals** - Research tab
   - Detailed financial statements
   - Balance sheet analysis

3. **Ownership Data** - Research tab
   - Insider holdings
   - Institutional ownership

4. **Peer Comparison** - Research tab
   - AI-powered peer analysis
   - Industry benchmarking

5. **Investor Calendar** - Portfolio & Research tabs
   - Earnings dates
   - Dividend dates
   - Corporate actions

6. **Stock Dividends** - Research tab
   - Dividend history
   - Yield analysis

---

## 7. BACKEND INTEGRATION POINTS

### 7.1 API Endpoints (Inferred)

**Authentication:**
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/register` - Registration
- `GET /api/auth/me` - Current user info

**Portfolios:**
- `GET /api/portfolios` - List portfolios
- `GET /api/portfolios/{id}` - Get portfolio details
- `POST /api/portfolios` - Create portfolio
- `PUT /api/portfolios/{id}` - Update portfolio
- `DELETE /api/portfolios/{id}` - Delete portfolio

**Positions:**
- `GET /api/portfolios/{id}/positions` - List positions
- `POST /api/portfolios/{id}/positions` - Add position
- `PUT /api/portfolios/{id}/positions/{posId}` - Update position
- `DELETE /api/portfolios/{id}/positions/{posId}` - Remove position

**Transactions:**
- `GET /api/transactions` - List all transactions
- `GET /api/portfolios/{id}/transactions` - Portfolio transactions
- `POST /api/portfolios/{id}/transactions` - Create transaction

**Research:**
- `GET /api/research/{symbol}` - Stock overview
- `GET /api/research/{symbol}/fundamentals` - Financial data
- `GET /api/research/{symbol}/news` - Stock news
- `GET /api/research/{symbol}/projections` - Analyst projections

**Search:**
- `GET /api/search/instruments?q={query}` - Stock search
- `GET /api/search/instruments/filter` - Filter by type

**Cash Wallets:**
- `GET /api/wallets` - List cash wallets
- `POST /api/wallets/{id}/deposit` - Deposit
- `POST /api/wallets/{id}/withdraw` - Withdraw
- `POST /api/wallets/{id}/transfer` - Transfer

**User Settings:**
- `GET /api/settings/profile` - Profile settings
- `PUT /api/settings/profile` - Update profile
- `GET /api/settings/notifications` - Notification preferences
- `PUT /api/settings/notifications` - Update notifications

---

## 8. TECHNOLOGY STACK (Observable)

### Frontend
- **Framework:** Vue.js (Vue 3 based on data-v attributes)
- **CSS Framework:** Tailwind CSS (utility classes evident)
- **State Management:** (Likely Pinia or Vuex)
- **HTTP Client:** (Likely Axios)
- **Charts/Graphs:** (Chart library for performance/allocation)

### Backend
- **Architecture:** RESTful API
- **Language:** (Node.js/Python/Java - not visible)
- **Database:** (Not visible)

### Infrastructure
- **Hosting:** Cloud hosted (app.example-service.ai)
- **Authentication:** Email/Password + OAuth (Google)
- **Multi-language:** English/Polish (i18n)

---

## 9. USER WORKFLOWS

### 9.1 New User Onboarding
1. Register account
2. Login
3. Create investment portfolio (manual or import from broker)
4. Add positions manually or import
5. Configure notifications
6. Explore research tools

### 9.2 Portfolio Management Workflow
1. Login
2. View portfolio overview
3. Add/edit positions as needed
4. Monitor performance via charts
5. Check allocation and risk metrics
6. Review transactions and history
7. Make adjustments based on research

### 9.3 Research & Decision Making
1. Access research section
2. Search for stocks
3. View fundamental metrics
4. Read news
5. Check investor relations info
6. Use charting tools to compare
7. View projections
8. Add to watchlist for monitoring

### 9.4 Cash Management
1. Access cash wallet
2. Deposit funds
3. Transfer between wallets
4. View history
5. Make trades with available cash

---

## 10. ERROR STATES & EDGE CASES

### Tested:
- Login form validation (disabled submit until valid)
- Dialog modal opening/closing
- Form submission without saving (tested via "Open" buttons)
- Search functionality (tested TSLA stock search)
- Navigation between sections
- Position actions menu (Sell, Dividend, Edit, Remove)
- Transaction delete confirmation
- Portfolio delete confirmation
- Edit position inline editing
- Remove position confirmation with detailed warnings

### Observed Behaviors:
- Language auto-detection (switched to Polish during session)
- Premium feature badges with "upgrade to unlock" messaging
- Column customization in holdings table
- Time period filtering on charts
- Auto-save on field blur in edit position form
- Transaction fee calculation (dollar or percentage mode toggle)
- Net proceeds calculation in sell form
- Tax lot method selection (FIFO default)
- Delete actions require explicit confirmation with warning messages
- Edit transaction triggers inline table edit within position editor

---

## 11. ACCESSIBILITY & UX PATTERNS

### Navigation Patterns:
- Persistent sidebar (always visible)
- Tab-based sub-navigation
- Breadcrumb-like "Go back" buttons
- Search accessibility (⌘ K keyboard shortcut)

### Form Patterns:
- Disabled submit buttons until validation
- Modal dialogs for complex forms
- Search/autocomplete for selections
- Multi-step workflows (type selection → data entry)

### Data Presentation:
- Sortable/filterable tables
- Multiple chart types (pie, line, bar)
- Summary cards at top of pages
- Customizable columns

---

## 12. SUMMARY OF KEY FINDINGS

**Strengths Observed:**
1. Comprehensive portfolio tracking (multiple portfolio types)
2. Rich research tools integrated
3. Professional charting capabilities
4. Real-time data (inferred from daily changes)
5. Multi-currency support
6. Mobile-responsive design (inferred from Tailwind)
7. Premium tiering for advanced features

**Complexity Areas:**
1. Multiple portfolio types (Investment, Cash)
2. Various position types (Stock, ETF, Crypto, Options, CFDs)
3. Complex filtering/customization options
4. Tab-heavy interface (9+ tabs in portfolio detail)
5. Integration with broker connections (skipped in exploration)

**Data Management:**
- Real-time portfolio valuation
- Transaction history tracking
- Gain/loss calculations (realized & unrealized)
- Performance metrics (daily change, return %)
- Risk metrics (beta, volatility, VaR)

---

## 13. SCREENSHOTS INVENTORY

All screenshots saved in `/docs` folder with naming convention `NN-section-name.png`:

**Login & Main:**
- 01-login-page.png
- 04-investments-page.png

**Portfolio Detail Tabs:**
- 05-portfolio-holdings.png
- 06-portfolio-transactions.png
- 07-portfolio-performance.png
- 08-portfolio-allocation.png
- 09-portfolio-risk-analysis.png
- 10-portfolio-dividends.png
- 11-portfolio-news.png
- 12-portfolio-compare.png

**Investments Sections:**
- 13-investments-main.png
- 14-investments-transactions.png
- 15-watchlists.png

**Research Pages:**
- 16-research-stock-overview.png
- 17-research-stock-news.png
- 18-research-investor-relations.png
- 19-research-projections.png

**Tools & Settings:**
- 20-charting.png
- 21-news-dashboard.png
- 23-settings.png
- 24-settings-shared-portfolios.png
- 25-settings-alerts.png

**Forms & Interactions:**
- 27-add-position-form.png
- 28-add-position-stock-form.png
- 29-add-position-search-results.png
- 31-cash-wallet-deposit-form.png

---

## 14. RECOMMENDATIONS FOR IMPLEMENTATION

1. **Backend First:** Establish API contracts early (portfolio CRUD, position management, etc.)
2. **Database Schema:** Model portfolios, positions, transactions, users with proper relationships
3. **Real-time Updates:** Implement WebSocket for price updates and portfolio changes
4. **Authentication:** Set up OAuth + email/password auth with secure token management
5. **Data Validation:** Front-end + back-end validation for all forms
6. **Error Handling:** User-friendly error messages with clear next steps
7. **Performance:** Optimize for large portfolios (100+ positions)
8. **Caching:** Cache research data and fundamental metrics
9. **Analytics:** Track user behavior (portfolio creation, research usage, etc.)
10. **Testing:** Comprehensive unit + integration tests for portfolio calculations

---

**End of Inventory Document**
