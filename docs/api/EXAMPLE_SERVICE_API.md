# Example service.ai API Documentation

> **Base URL:** `https://app.example-service.ai`  
> **API Prefix (inferred):** `/api/v1` or `/en/api`  
> **Authentication:** Session cookie / Bearer token (JWT), plus Google OAuth  
> **Language prefix:** All authenticated app routes are prefixed with `/{locale}` (e.g., `/en/`, `/pl/`)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [User / Profile](#2-user--profile)
3. [Portfolio Endpoints](#3-portfolio-endpoints)
4. [Position Endpoints](#4-position-endpoints)
5. [Transaction Endpoints](#5-transaction-endpoints)
6. [Cash Wallet Endpoints](#6-cash-wallet-endpoints)
7. [Watchlist Endpoints](#7-watchlist-endpoints)
8. [Research / Instrument Endpoints](#8-research--instrument-endpoints)
9. [News Endpoints](#9-news-endpoints)
10. [Alerts / Notifications Endpoints](#10-alerts--notifications-endpoints)
11. [Settings Endpoints](#11-settings-endpoints)
12. [Broker Import Endpoints](#12-broker-import-endpoints)
13. [Copilot (AI) Endpoints](#13-copilot-ai-endpoints)
14. [Data Models](#14-data-models)
15. [Resource Relationships](#15-resource-relationships)

---

## 1. Authentication

### 1.1 Login with Email/Password

**POST** `/api/auth/login`

Authenticates a user with email and password credentials. On success returns a session token / sets a session cookie. The login form shows a loading spinner on the Sign In button during submission (button disabled state), indicating async form submission.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "remember_me": true
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "language": "en"
  },
  "redirect_url": "/en/investments"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid credentials"
}
```

---

### 1.2 Login with Google OAuth

**GET** `/api/auth/google`  
**POST** `/api/auth/google/callback`

Initiates the Google OAuth2 flow. The button "Sign in with Google" triggers this endpoint.

**Response:** Redirect to Google OAuth consent screen, then callback with token.

---

### 1.3 Logout

**POST** `/api/auth/logout`

Invalidates the user's session. Triggered by the "Logout" button in the sidebar.

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 1.4 Register

**POST** `/api/auth/register`

Creates a new user account. Registration page at `/en/register`.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "first_name": "John",
  "last_name": "Doe"
}
```

---

### 1.5 Forgot Password

**POST** `/api/auth/forgot-password`

Sends a password reset email. Page at `/en/forgot-password`.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

---

### 1.6 Reset Password

**POST** `/api/auth/reset-password`

Completes password reset with a token from email.

**Request Body:**
```json
{
  "token": "reset_token_string",
  "password": "new_password",
  "password_confirmation": "new_password"
}
```

---

## 2. User / Profile

### 2.1 Get Current User Profile

**GET** `/api/users/me`

Returns the authenticated user's profile data. Used to populate the Settings > Profile page.

**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "demo@example.com",
  "first_name": "string",
  "last_name": "string",
  "language": "en",
  "created_at": "2026-01-01T00:00:00Z"
}
```

---

### 2.2 Update Profile

**PATCH** `/api/users/me`

Updates first name and/or last name. Email cannot be changed. The "Save Changes" button is disabled until a field changes.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe"
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "demo@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "language": "en"
}
```

---

### 2.3 Change Password

**POST** `/api/users/me/change-password`

Updates the user's password. "Update password" button is disabled until both fields are filled and meet requirements.

**Request Body:**
```json
{
  "new_password": "NewPassword123",
  "confirm_password": "NewPassword123"
}
```

---

### 2.4 Update Language Preference

**PATCH** `/api/users/me/language`

Changes the UI language. Applied immediately without page reload.

**Request Body:**
```json
{
  "language": "en"
}
```

---

### 2.5 Clear Account Data

**DELETE** `/api/users/me/data`

Permanently deletes all wallets, portfolios, and transaction history, but preserves the account login.

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 2.6 Delete Account

**DELETE** `/api/users/me`

Permanently deletes the user account and all associated data.

**Response (204 No Content)**

---

## 3. Portfolio Endpoints

Portfolio ID observed in snapshots: `3cb589d8-f92d-428f-aeab-9ee5d4b9cef2`

### 3.1 List All Portfolios (Investment + Cash Wallets)

**GET** `/api/portfolios`

Returns all investment portfolios and cash wallets for the authenticated user, with summary statistics. Used to render the `/en/investments` dashboard.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `currency` | string | Display currency code (e.g., `USD`) |

**Response (200 OK):**
```json
{
  "investment_portfolios": [
    {
      "id": "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2",
      "name": "Top10",
      "strategy": "Growth",
      "description": "Top10 big US stocks with best growth potential, rebalanced monthly",
      "currency": "USD",
      "total_value": 109916.76,
      "total_invested": 98083.40,
      "total_return_pct": 12.06,
      "unrealized_gain": 11833.36,
      "realized_gain": 0.00,
      "income": 0.00,
      "daily_change": 3576.36,
      "daily_change_pct": 3.36,
      "position_count": 10,
      "chart_data": {},
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "cash_wallets": [
    {
      "id": "wallet-uuid",
      "name": "Portfel USD 1",
      "currency": "USD",
      "balance": 1916.60,
      "available_balance": 1916.60,
      "chart_data": {}
    }
  ],
  "summary": {
    "total_investment_value": 109916.76,
    "total_invested": 98083.40,
    "total_return_pct": 12.06,
    "total_cash_balance": 1916.60,
    "display_currency": "USD"
  }
}
```

---

### 3.2 Get Portfolio Details

**GET** `/api/portfolios/{portfolioId}`

Returns detailed data for a single investment portfolio. Used to render the portfolio holdings tab at `/en/portfolios/{portfolioId}`.

**Path Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `portfolioId` | UUID | Portfolio identifier |

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `currency` | string | Display currency override |

**Response (200 OK):**
```json
{
  "id": "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2",
  "name": "Top10",
  "strategy": "Growth",
  "description": "Top10 big US stocks...",
  "currency": "USD",
  "total_value": 109916.76,
  "total_invested": 98083.40,
  "total_return_pct": 12.06,
  "unrealized_gain": 11833.36,
  "realized_gain": 0.00,
  "income": 0.00,
  "daily_change": 3576.36,
  "daily_change_pct": 3.36,
  "position_count": 10,
  "positions": [ /* see Position model */ ],
  "created_at": "2026-08-02T00:00:00Z"
}
```

---

### 3.3 Create Investment Portfolio

**POST** `/api/portfolios`

Creates a new investment portfolio. Triggered by "Create Investment Portfolio" button.

**Request Body:**
```json
{
  "name": "My Portfolio",
  "strategy": "Growth",
  "description": "Optional description",
  "currency": "USD"
}
```

**Response (201 Created):**
```json
{
  "id": "new-uuid",
  "name": "My Portfolio",
  "currency": "USD",
  "total_value": 0,
  "total_invested": 0
}
```

---

### 3.4 Rename Portfolio

**PATCH** `/api/portfolios/{portfolioId}`

Renames the portfolio. Triggered by the "Rename" button in the portfolio header.

**Request Body:**
```json
{
  "name": "New Portfolio Name"
}
```

---

### 3.5 Delete Portfolio

**DELETE** `/api/portfolios/{portfolioId}`

Permanently deletes the portfolio, all its positions, all transactions, and (if unshared) the linked cash wallet. Triggered by confirming the "Delete Portfolio" dialog.

**Response (204 No Content)**

---

### 3.6 Get Portfolio Performance

**GET** `/api/portfolios/{portfolioId}/performance`

Returns time-series performance data for the portfolio. Used to render the Performance tab.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `period` | string | `1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `ALL` |
| `currency` | string | Display currency |

**Response (200 OK):**
```json
{
  "portfolio_id": "uuid",
  "period": "1Y",
  "data_points": [
    {
      "date": "2025-08-08",
      "value": 100000.00,
      "return_pct": 0.0
    }
  ],
  "benchmark_data": {}
}
```

---

### 3.7 Get Portfolio Allocation

**GET** `/api/portfolios/{portfolioId}/allocation`

Returns allocation breakdown by sector, asset type, geography, etc. Used by the Allocation tab.

**Response (200 OK):**
```json
{
  "by_symbol": [
    { "symbol": "MSFT", "weight_pct": 14.56, "value": 15999.68 }
  ],
  "by_sector": [
    { "sector": "Technology", "weight_pct": 100, "value": 109916.76 }
  ],
  "by_asset_type": [
    { "type": "Stock", "weight_pct": 100 }
  ]
}
```

---

### 3.8 Get Portfolio Risk Analysis

**GET** `/api/portfolios/{portfolioId}/risk-analysis`

Returns risk metrics (volatility, Sharpe ratio, beta, drawdowns, etc.) for the Risk Analysis tab.

---

### 3.9 Get Portfolio Dividends

**GET** `/api/portfolios/{portfolioId}/dividends`

Returns dividend income history and projections for the Dividends tab.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `period` | string | Date range filter |

---

### 3.10 Get Portfolio News

**GET** `/api/portfolios/{portfolioId}/news`

Returns news articles relevant to the holdings in the portfolio. Used by the News tab.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Pagination page |
| `per_page` | integer | Items per page |

---

### 3.11 Get Portfolio Compare

**GET** `/api/portfolios/{portfolioId}/compare`

Returns comparison data against benchmarks or other portfolios.

---

### 3.12 Get Portfolio Calendar

**GET** `/api/portfolios/{portfolioId}/calendar`  
*(Premium feature)*

Returns earnings calls, dividend ex-dates, and other calendar events for the portfolio's holdings.

---

### 3.13 Share Portfolio

**POST** `/api/portfolios/{portfolioId}/share`

Generates a shareable link for the portfolio. Triggered by the "Share" button.

**Response (200 OK):**
```json
{
  "share_url": "https://app.example-service.ai/shared/abc123",
  "expires_at": null
}
```

---

### 3.14 Get Portfolio Chart Data

**GET** `/api/portfolios/{portfolioId}/chart`

Returns OHLCV-style chart data for the portfolio value over time. Used by the mini-charts on portfolio cards with period buttons 1D/1W/1M/3M/6M/1Y/ALL.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `period` | string | `1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `ALL` |
| `currency` | string | Display currency |

---

### 3.15 Export Portfolio Positions

**GET** `/api/portfolios/{portfolioId}/positions/export`

Exports the positions table as CSV or Excel. Triggered by the "Export" button on the Holdings tab.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `format` | string | `csv` or `xlsx` |

---

### 3.16 List All Transactions Across Portfolios

**GET** `/api/investments/transactions`

Returns all transactions across all portfolios. Used by the `/en/investments/transactions` page.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `date_from` | date | Start date filter |
| `date_to` | date | End date filter |
| `type` | string | `Buy`, `Sell`, `Dividend` |
| `symbol` | string | Filter by ticker symbol |
| `amount_min` | number | Minimum transaction amount |
| `amount_max` | number | Maximum transaction amount |
| `page` | integer | Page number |
| `per_page` | integer | `10`, `20`, `50`, `100`, or `all` |
| `sort_by` | string | Column to sort by |
| `sort_dir` | string | `asc` or `desc` |

---

## 4. Position Endpoints

A "position" is an aggregated holding of a single instrument within a portfolio.

### 4.1 List Portfolio Positions

**GET** `/api/portfolios/{portfolioId}/positions`

Returns all positions within a portfolio. Used to render the Holdings tab table.

**Response (200 OK):**
```json
{
  "positions": [
    {
      "id": "position-uuid",
      "portfolio_id": "3cb589d8-f92d-428f-aeab-9ee5d4b9cef2",
      "instrument": {
        "symbol": "AMAT",
        "isin": "US0382221051",
        "name": "Applied Materials Inc",
        "type": "Stock",
        "exchange": "US",
        "currency": "USD",
        "logo_url": "https://..."
      },
      "quantity": 15,
      "avg_cost": 505.97,
      "current_price": 539.14,
      "market_value": 8087.10,
      "total_cost": 7589.48,
      "gain_loss": 497.63,
      "gain_loss_pct": 6.56,
      "weight_pct": 7.36,
      "linked_wallet_id": "wallet-uuid"
    }
  ],
  "total_gain_loss": 11833.36,
  "total_gain_loss_pct": 12.06,
  "total_market_value": 109916.76
}
```

---

### 4.2 Add Position (Buy)

**POST** `/api/portfolios/{portfolioId}/positions`

Creates a new position (or adds a buy transaction to an existing one). Triggered by the "Add Position" flow for Stock/ETF/Crypto instruments.

**Request Body:**
```json
{
  "instrument_id": "instrument-uuid",
  "symbol": "AAPL",
  "type": "Stock",
  "transaction_type": "Buy",
  "quantity": 10,
  "price_per_share": 313.20,
  "transaction_date": "2026-08-08",
  "fees": 0.00,
  "fees_type": "fixed",
  "currency": "USD",
  "exchange_rate": null,
  "wallet_id": "wallet-uuid",
  "notes": ""
}
```

**Response (201 Created):**
```json
{
  "position": { /* Position object */ },
  "transaction": { /* Transaction object */ }
}
```

---

### 4.3 Add Option Position

**POST** `/api/portfolios/{portfolioId}/positions`

Creates an option position. Type selected from the "Add Position" instrument type picker.

**Request Body:**
```json
{
  "type": "Option",
  "underlying_symbol": "AAPL",
  "option_type": "Call",
  "strike": 320.00,
  "expiry_date": "2026-09-19",
  "quantity": 1,
  "premium": 5.50,
  "transaction_date": "2026-08-08",
  "fees": 0.00,
  "wallet_id": "wallet-uuid"
}
```

---

### 4.4 Add CFD Position

**POST** `/api/portfolios/{portfolioId}/positions`

Creates a CFD (leveraged) position entered manually.

**Request Body:**
```json
{
  "type": "CFD",
  "symbol": "CUSTOM",
  "name": "Custom CFD",
  "direction": "Long",
  "quantity": 100,
  "entry_price": 50.00,
  "leverage": 5,
  "transaction_date": "2026-08-08",
  "wallet_id": "wallet-uuid"
}
```

---

### 4.5 Sell Position

**POST** `/api/portfolios/{portfolioId}/positions/{positionId}/sell`

Records a sell transaction for an existing position. Form fields: quantity, sell date, tax lot method, sell price, fees.

**Request Body:**
```json
{
  "quantity": 1,
  "sell_date": "2026-08-08",
  "sell_price": 539.14,
  "tax_lot_method": "FIFO",
  "fees": 0.00,
  "fees_type": "fixed",
  "wallet_id": "wallet-uuid"
}
```

**Response (200 OK):**
```json
{
  "transaction": {
    "id": "txn-uuid",
    "type": "Sell",
    "quantity": 1,
    "price": 539.14,
    "net_proceeds": 539.14,
    "profit_loss": 33.18,
    "profit_loss_pct": 6.56
  },
  "position": { /* updated Position object */ }
}
```

---

### 4.6 Record Dividend

**POST** `/api/portfolios/{portfolioId}/positions/{positionId}/dividends`

Records a dividend payment for a position. Supports Total Amount or Per Share entry modes.

**Request Body:**
```json
{
  "entry_mode": "total",
  "gross_amount": 15.00,
  "withholding_tax": 2.25,
  "date_received": "2026-08-08",
  "wallet_id": "wallet-uuid",
  "notes": "Q4 2024 dividend"
}
```

**Response (201 Created):**
```json
{
  "id": "dividend-uuid",
  "gross_amount": 15.00,
  "withholding_tax": 2.25,
  "net_amount": 12.75,
  "date_received": "2026-08-08"
}
```

---

### 4.7 Edit Position (Add/Update Transactions inline)

**PATCH** `/api/portfolios/{portfolioId}/positions/{positionId}`

The "Edit position" dialog shows all individual buy transactions in an inline editable table and allows adding new rows. Each field change auto-saves on blur.

**Request Body:**
```json
{
  "transactions": [
    {
      "id": "txn-uuid",
      "date": "2026-08-02",
      "type": "Buy",
      "quantity": 15,
      "price_per_share": 505.965,
      "fees": 0.00,
      "currency": "USD"
    }
  ]
}
```

---

### 4.8 Remove Position

**DELETE** `/api/portfolios/{portfolioId}/positions/{positionId}`

Permanently removes a position and all its transactions. Cash from trades is returned to the linked wallet where possible. Triggered by confirming "Remove position?" dialog.

**Response (204 No Content)**

---

### 4.9 Search Instruments

**GET** `/api/instruments/search`

Searches for stocks, ETFs, crypto, or instruments by ISIN. Used by the instrument search modal when adding a position or researching.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `q` | string | Search query (ticker, name, or ISIN) |
| `types` | string | Comma-separated filter: `Stock`, `ETF`, `Crypto`, `Index` |
| `limit` | integer | Max results (default: 20) |

**Response (200 OK):**
```json
{
  "results": [
    {
      "id": "instrument-uuid",
      "symbol": "AAPL",
      "isin": "US0382221051",
      "name": "Apple Inc",
      "type": "Stock",
      "exchange": "US",
      "currency": "USD",
      "current_price": 313.20,
      "logo_url": "https://..."
    }
  ]
}
```

---

## 5. Transaction Endpoints

### 5.1 List Portfolio Transactions

**GET** `/api/portfolios/{portfolioId}/transactions`

Returns paginated, filterable list of all transactions in a portfolio. Used by the Transactions tab.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `date_from` | date | Start date |
| `date_to` | date | End date |
| `type` | string | `Buy`, `Sell`, `Dividend` |
| `symbol` | string | Ticker symbol filter |
| `amount_min` | number | Min transaction amount |
| `amount_max` | number | Max transaction amount |
| `page` | integer | Page number |
| `per_page` | integer | `10`, `20`, `50`, `100`, `all` |
| `sort_by` | string | `date`, `symbol`, `type`, `quantity`, `price`, `fees`, `amount`, `pnl` |
| `sort_dir` | string | `asc` or `desc` |

**Response (200 OK):**
```json
{
  "transactions": [
    {
      "id": "txn-uuid",
      "portfolio_id": "portfolio-uuid",
      "position_id": "position-uuid",
      "instrument": {
        "symbol": "KLAC",
        "name": "KLA Corp",
        "type": "Stock",
        "exchange": "US"
      },
      "date": "2026-08-02T02:00:00Z",
      "type": "Buy",
      "quantity": 42,
      "price": 181.765,
      "instrument_currency": "USD",
      "fees": 0.00,
      "exchange_rate": null,
      "amount": -7634.13,
      "pnl": null
    }
  ],
  "summary": {
    "total_bought": 98083.40,
    "total_bought_count": 10,
    "total_sold": 0.00,
    "total_sold_count": 0,
    "dividends": 0.00,
    "dividends_count": 0,
    "realized_gain_loss": 0.00,
    "total_fees": 0.00
  },
  "pagination": {
    "total": 10,
    "page": 1,
    "per_page": 10,
    "total_pages": 1
  }
}
```

---

### 5.2 Edit Transaction

**PUT** `/api/portfolios/{portfolioId}/transactions/{transactionId}`

Updates a single transaction's fields. Opens the "Edit Buy Transaction" dialog with instrument info, historical price for the date, and editable quantity/price/fees fields.

**Request Body:**
```json
{
  "date": "2026-08-02",
  "quantity": 42,
  "price_per_share": 181.765,
  "fees": 0.00,
  "fees_type": "fixed",
  "wallet_id": "wallet-uuid"
}
```

**Response (200 OK):**
```json
{
  "id": "txn-uuid",
  "quantity": 42,
  "price": 181.765,
  "total_cost": 7634.13,
  "updated_at": "2026-08-08T12:30:00Z"
}
```

---

### 5.3 Delete Transaction

**DELETE** `/api/portfolios/{portfolioId}/transactions/{transactionId}`

Permanently deletes a single transaction. Confirmed via "Delete Transaction" dialog. Cannot be undone.

**Response (204 No Content)**

---

### 5.4 Export Transactions

**GET** `/api/portfolios/{portfolioId}/transactions/export`

Exports filtered transaction list as CSV or Excel.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `format` | string | `csv` or `xlsx` |
| (all filter params from List) | | Applied before export |

---

### 5.5 Get Historical Price for Instrument on Date

**GET** `/api/instruments/{symbol}/price`

Returns the historical closing price for an instrument on a specific date. Used in the "Edit Buy Transaction" dialog to show "Historical Price".

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `date` | date | YYYY-MM-DD |
| `exchange` | string | Exchange suffix (e.g., `US`) |

**Response (200 OK):**
```json
{
  "symbol": "KLAC",
  "date": "2026-08-02",
  "price": 181.77,
  "currency": "USD"
}
```

---

## 6. Cash Wallet Endpoints

### 6.1 List Cash Wallets

**GET** `/api/wallets`

Returns all cash wallets for the user.

**Response (200 OK):**
```json
{
  "wallets": [
    {
      "id": "wallet-uuid",
      "name": "Portfel USD 1",
      "currency": "USD",
      "balance": 1916.60,
      "available_balance": 1916.60,
      "linked_portfolio_ids": ["portfolio-uuid"],
      "chart_data": {}
    }
  ],
  "summary": {
    "total_balance": 1916.60,
    "by_currency": [
      { "currency": "USD", "balance": 1916.60, "pct": 100 }
    ]
  }
}
```

---

### 6.2 Create Cash Wallet

**POST** `/api/wallets`

Creates a new cash wallet. Triggered by "Create Cash Wallet" button.

**Request Body:**
```json
{
  "name": "My USD Wallet",
  "currency": "USD"
}
```

**Response (201 Created):**
```json
{
  "id": "new-wallet-uuid",
  "name": "My USD Wallet",
  "currency": "USD",
  "balance": 0.00
}
```

---

### 6.3 Get Wallet Details / Chart

**GET** `/api/wallets/{walletId}`

Returns wallet details and chart data for selected period.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `period` | string | `1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `ALL` |

---

### 6.4 Deposit Funds

**POST** `/api/wallets/{walletId}/deposit`

Records a cash deposit into a wallet. Fields: amount (USD), description (optional), transaction date.

**Request Body:**
```json
{
  "amount": 5000.00,
  "currency": "USD",
  "description": "Monthly savings",
  "transaction_date": "2026-08-08"
}
```

**Response (201 Created):**
```json
{
  "id": "cash-txn-uuid",
  "type": "Deposit",
  "amount": 5000.00,
  "currency": "USD",
  "transaction_date": "2026-08-08",
  "new_balance": 6916.60
}
```

---

### 6.5 Withdraw Funds

**POST** `/api/wallets/{walletId}/withdraw`

Records a cash withdrawal from a wallet. Fields: amount, transaction date, description, payment method.

**Request Body:**
```json
{
  "amount": 500.00,
  "currency": "USD",
  "transaction_date": "2026-08-08",
  "description": "Bill payment",
  "payment_method": "bank_transfer"
}
```

**Response (201 Created):**
```json
{
  "id": "cash-txn-uuid",
  "type": "Withdrawal",
  "amount": 500.00,
  "remaining_balance": 1416.60
}
```

---

### 6.6 Transfer Funds Between Wallets

**POST** `/api/wallets/{walletId}/transfer`

Transfers funds from one wallet to another. Fields: from wallet (pre-filled), to wallet (select), amount, transfer date, fees (optional, fixed or %).

**Request Body:**
```json
{
  "from_wallet_id": "source-wallet-uuid",
  "to_wallet_id": "destination-wallet-uuid",
  "amount": 1000.00,
  "transfer_date": "2026-08-08",
  "fees": 0.00,
  "fees_type": "fixed"
}
```

**Response (201 Created):**
```json
{
  "id": "transfer-uuid",
  "type": "Transfer",
  "from_wallet_id": "source-uuid",
  "to_wallet_id": "destination-uuid",
  "amount": 1000.00,
  "fees": 0.00,
  "transfer_date": "2026-08-08"
}
```

---

### 6.7 Get Wallet Transaction History

**GET** `/api/wallets/{walletId}/history`

Returns paginated list of all cash transactions (deposits, withdrawals, transfers) for the wallet.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number |
| `per_page` | integer | Items per page |
| `date_from` | date | Start date |
| `date_to` | date | End date |

---

### 6.8 Update Wallet (Rename / Manage)

**PATCH** `/api/wallets/{walletId}`

Renames or updates wallet settings. Triggered by "Manage" button on the wallet card.

**Request Body:**
```json
{
  "name": "New Wallet Name"
}
```

---

### 6.9 Delete Wallet

**DELETE** `/api/wallets/{walletId}`

Deletes a cash wallet and its transaction history, if not shared with another portfolio.

**Response (204 No Content)**

---

## 7. Watchlist Endpoints

### 7.1 List Watchlists

**GET** `/api/watchlists`

Returns all watchlists for the user. Page at `/en/investments/watchlist`. Empty state shows "Create First Watchlist" when no watchlists exist.

**Response (200 OK):**
```json
{
  "watchlists": [
    {
      "id": "watchlist-uuid",
      "name": "My Watchlist",
      "item_count": 5,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

### 7.2 Create Watchlist

**POST** `/api/watchlists`

Creates a new watchlist.

**Request Body:**
```json
{
  "name": "Tech Stocks"
}
```

---

### 7.3 Get Watchlist Details

**GET** `/api/watchlists/{watchlistId}`

Returns the watchlist with all tracked instruments and their current data.

**Response (200 OK):**
```json
{
  "id": "watchlist-uuid",
  "name": "Tech Stocks",
  "items": [
    {
      "id": "item-uuid",
      "instrument": {
        "symbol": "AAPL",
        "name": "Apple Inc",
        "type": "Stock",
        "current_price": 313.20,
        "change_pct": 1.5
      },
      "added_at": "2026-08-01T00:00:00Z"
    }
  ]
}
```

---

### 7.4 Add Instrument to Watchlist

**POST** `/api/watchlists/{watchlistId}/items`

Adds a stock/ETF to a watchlist. Triggered by "Add to Watchlist" button on the research page.

**Request Body:**
```json
{
  "instrument_id": "instrument-uuid",
  "symbol": "AAPL"
}
```

---

### 7.5 Remove Instrument from Watchlist

**DELETE** `/api/watchlists/{watchlistId}/items/{itemId}`

Removes an instrument from a watchlist.

**Response (204 No Content)**

---

### 7.6 Delete Watchlist

**DELETE** `/api/watchlists/{watchlistId}`

Deletes an entire watchlist.

**Response (204 No Content)**

---

## 8. Research / Instrument Endpoints

Research pages follow the pattern `/en/research/{symbol}.{exchange}/{tab}` — e.g., `/en/research/AAPL.US/overview`.

### 8.1 Get Instrument Overview

**GET** `/api/instruments/{symbol}/overview`

Returns comprehensive company overview data. Used by the Research > Overview tab.

**Path Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `symbol` | string | Ticker with exchange suffix, e.g., `AAPL.US` |

**Response (200 OK):**
```json
{
  "symbol": "AAPL",
  "exchange": "US",
  "name": "Apple Inc",
  "isin": "US0382221051",
  "logo_url": "https://...",
  "current_price": 313.20,
  "description": "Apple Inc. is an American multinational...",
  "profile": {
    "ceo": null,
    "sector": "Technology",
    "year_founded": 1980,
    "employees": 166000,
    "website": "https://www.apple.com/"
  },
  "statistics": {
    "market_cap": 4600000000000,
    "enterprise_value": 4620000000000,
    "shares_outstanding": 14690000000,
    "revenue_ttm": 466820000000,
    "margins": {
      "gross": 48.6,
      "ebitda": 36.0,
      "operating": 33.2,
      "pre_tax": 33.4,
      "net": 27.6,
      "fcf": 29.3
    },
    "returns_ttm": {
      "roa": 36.1,
      "rota": 37.1,
      "roe": 148.8
    },
    "valuation_ttm": {
      "pe": 36.0,
      "pb": 42.8,
      "ev_sales": 9.9,
      "ev_ebitda": 27.5,
      "p_fcf": 33.6,
      "ev_gross_profit": 20.3
    },
    "valuation_ntm": {
      "price_target": 329.27,
      "pe": 32.0,
      "peg": 2.2,
      "ev_sales": 8.6,
      "ev_ebitda": 24.6
    },
    "financial_health": {
      "cash": 68510000000,
      "net_debt": 15840000000
    },
    "growth_cagr": {
      "revenue_3yr": 1.8,
      "revenue_5yr": 8.7,
      "revenue_10yr": 5.9,
      "dil_eps_3yr": 6.9,
      "dil_eps_5yr": 17.9,
      "dil_eps_10yr": 12.5,
      "revenue_fwd_2yr": 8.4,
      "ebitda_fwd_2yr": 9.1,
      "eps_fwd_2yr": 11.6,
      "eps_lt_growth_est": 14.3
    },
    "dividends": {
      "yield_pct": 0.3,
      "payout_pct": 12.1,
      "dps": 1.03,
      "dps_growth_3yr": 2.8,
      "dps_growth_5yr": 3.8
    }
  },
  "latest_earnings_call": {
    "title": "AAPL - Earnings call Q3 2026",
    "date": "2026-07-30"
  }
}
```

---

### 8.2 Get Instrument Price Chart

**GET** `/api/instruments/{symbol}/chart`

Returns price chart time-series data. Used by the price chart on the research overview page with period buttons 1D/5D/1M/3M/6M/YTD/1Y/3Y/5Y/10Y/MAX, and modes Price/Percentage/Drawdowns.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `period` | string | `1D`, `5D`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`, `10Y`, `MAX` |
| `mode` | string | `price`, `pct`, `drawdowns` |
| `compare` | string | Comma-separated symbols to overlay for comparison |

**Response (200 OK):**
```json
{
  "symbol": "AAPL",
  "period": "1Y",
  "data": [
    { "date": "2025-08-08", "open": 229.0, "high": 231.0, "low": 228.0, "close": 229.5, "volume": 50000000 }
  ],
  "summary": {
    "change": 83.98,
    "change_pct": 36.6,
    "cagr": 36.7,
    "period_label": "Aug 08, 2025 - Aug 07, 2026 (12m)"
  }
}
```

---

### 8.3 Get Instrument Seasonality

**GET** `/api/instruments/{symbol}/seasonality`

Returns average monthly returns for seasonality analysis. Used on the research overview page.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `years` | integer | `3`, `5`, `10`, `20` |
| `metric` | string | `avg`, `median`, `min`, `max` |

**Response (200 OK):**
```json
{
  "symbol": "AAPL",
  "years": 5,
  "metric": "avg",
  "monthly_returns": [
    { "month": "Jan", "return_pct": 0.9 },
    { "month": "Feb", "return_pct": 0.2 }
  ]
}
```

---

### 8.4 Get EPS Surprises

**GET** `/api/instruments/{symbol}/eps-surprises`

Returns historical EPS estimate vs actual data. Used by the EPS Surprises chart on the Research overview.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `quarters` | integer | Number of quarters: `5`, `8`, `12` |

---

### 8.5 Get Instrument News

**GET** `/api/instruments/{symbol}/news`

Returns news articles for a specific instrument. Used by the Research > News tab.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number |
| `per_page` | integer | Items per page |

---

### 8.6 Get Instrument Fundamentals

**GET** `/api/instruments/{symbol}/fundamentals`  
*(Premium feature)*

Returns detailed financial statements (income statement, balance sheet, cash flow).

---

### 8.7 Get Investor Relations

**GET** `/api/instruments/{symbol}/investor-relations`

Returns SEC filings, earnings presentations, and investor relations documents. Used by Research > Investor Relations tab.

---

### 8.8 Get Instrument Projections

**GET** `/api/instruments/{symbol}/projections`

Returns analyst consensus price targets, revenue/EPS estimates, and forward projections. Used by Research > Projections tab.

---

### 8.9 Get Instrument Ownership

**GET** `/api/instruments/{symbol}/ownership`  
*(Premium feature)*

Returns institutional and insider ownership data.

---

### 8.10 Get Instrument Dividends (Research)

**GET** `/api/instruments/{symbol}/dividends`  
*(Premium feature)*

Returns dividend history, ex-dates, payment dates for a specific instrument.

---

### 8.11 Get Instrument Compare (AI Peer Analysis)

**GET** `/api/instruments/{symbol}/compare`  
*(Premium feature)*

Returns AI-powered peer comparison analysis.

---

### 8.12 Download Chart Data

**GET** `/api/instruments/{symbol}/chart/download`

Exports chart data as CSV or image. Triggered by the "Download" button on the price chart.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `format` | string | `csv` or `png` |
| `period` | string | Chart period |

---

### 8.13 Get Charting / Fundamentals Comparison Data

**GET** `/api/charting/compare`

Returns fundamental metrics for multiple stocks side by side. Used by the `/en/charting` page for comparing up to 10 stocks.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `symbols` | string | Comma-separated symbols (max 10) |
| `metrics` | string | Comma-separated metric keys |

---

## 9. News Endpoints

### 9.1 Get News Dashboard

**GET** `/api/news`

Returns the global news feed for the authenticated user, aggregated from tracked tickers and watchlists. Used by the `/en/news-dashboard` page.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number |
| `per_page` | integer | Items per page |
| `tickers` | string | Comma-separated ticker filter |
| `importance` | string | `watch`, `important`, `urgent` |

**Response (200 OK):**
```json
{
  "articles": [
    {
      "id": "article-uuid",
      "title": "Apple Reports Record Q3 Earnings",
      "summary": "...",
      "source": "Reuters",
      "published_at": "2026-07-30T14:00:00Z",
      "url": "https://...",
      "tickers": ["AAPL"],
      "importance": "important",
      "image_url": "https://..."
    }
  ],
  "pagination": { "page": 1, "total": 100 }
}
```

---

## 10. Alerts / Notifications Endpoints

### 10.1 Get Alerts Inbox

**GET** `/api/alerts`

Returns the alerts notification inbox. Triggered by the "Alerts" button in the sidebar which shows a bell icon.

**Query Parameters:**
| Parameter | Type | Description |
|---|---|---|
| `unread_only` | boolean | Filter to unread only |
| `page` | integer | Page number |

---

### 10.2 Get Alert Settings

**GET** `/api/settings/alerts`

Returns the user's alert configuration. Used by Settings > Alerts page.

**Response (200 OK):**
```json
{
  "event_types": {
    "news": {
      "enabled": true,
      "minimum_importance": "watch",
      "material_only": false
    },
    "earnings": {
      "enabled": true
    },
    "insider_trades": {
      "enabled": true,
      "minimum_trade_value": "any"
    },
    "analyst_ratings": {
      "enabled": true,
      "change_filter": "all"
    }
  },
  "tracked_tickers": [
    { "symbol": "AAPL", "is_default": true },
    { "symbol": "AMZN", "is_default": true },
    { "symbol": "GOOGL", "is_default": true },
    { "symbol": "META", "is_default": true },
    { "symbol": "MSFT", "is_default": true },
    { "symbol": "NVDA", "is_default": true },
    { "symbol": "TSLA", "is_default": true }
  ],
  "tickers": [],
  "show_default_tickers": true,
  "delivery": {
    "in_app": true,
    "push": false,
    "email": false
  }
}
```

---

### 10.3 Update Alert Settings

**PATCH** `/api/settings/alerts`

Updates alert preferences. Each toggle/slider/dropdown on the Settings > Alerts page submits changes.

**Request Body:**
```json
{
  "event_types": {
    "news": { "enabled": true, "minimum_importance": "important" },
    "earnings": { "enabled": true },
    "insider_trades": { "enabled": true, "minimum_trade_value": "10k" },
    "analyst_ratings": { "enabled": true, "change_filter": "upgrades" }
  },
  "show_default_tickers": true,
  "delivery": {
    "in_app": true,
    "push": false,
    "email": false
  }
}
```

---

### 10.4 Add Tracked Ticker to Alerts

**POST** `/api/settings/alerts/tickers`

Adds a ticker to the user's alert tracking list. Triggered by "Add ticker" button in alert settings.

**Request Body:**
```json
{
  "symbol": "NVDA"
}
```

---

### 10.5 Remove Tracked Ticker from Alerts

**DELETE** `/api/settings/alerts/tickers/{symbol}`

Removes a user-added ticker from alert tracking (default tickers cannot be individually removed).

---

### 10.6 Mark Alert as Read

**PATCH** `/api/alerts/{alertId}/read`

Marks a single alert notification as read.

---

### 10.7 Mark All Alerts as Read

**POST** `/api/alerts/mark-all-read`

Marks all notifications as read.

---

## 11. Settings Endpoints

### 11.1 Get Shared Portfolios

**GET** `/api/settings/shared-portfolios`

Returns list of portfolios the user has shared publicly. Used by Settings > Shared Portfolios page.

---

### 11.2 Get Broker Connections

**GET** `/api/settings/broker-connections`

Returns connected broker accounts. Used by Settings > Broker Connections page.

**Response (200 OK):**
```json
{
  "connections": [
    {
      "id": "connection-uuid",
      "broker": "Interactive Brokers",
      "status": "connected",
      "last_synced": "2026-08-08T10:00:00Z"
    }
  ]
}
```

---

### 11.3 Import from Broker

**POST** `/api/broker/import`

Initiates a broker import. Triggered by "Import from Broker" button.

**Request Body:**
```json
{
  "broker": "interactive_brokers",
  "connection_id": "connection-uuid",
  "portfolio_id": "portfolio-uuid"
}
```

---

### 11.4 Get Billing / Subscription Info

**GET** `/api/settings/billing`

Returns current subscription plan details, payment history, and upgrade options. Used by Settings > Billing page.

**Response (200 OK):**
```json
{
  "plan": "free",
  "features": {
    "ai_insights": false,
    "fundamentals": false,
    "ownership_data": false,
    "calendar": false,
    "ai_peer_analysis": false,
    "stock_dividends_research": false
  },
  "upgrade_price_from": 9.99,
  "billing_cycle": null,
  "next_billing_date": null
}
```

---

### 11.5 Report Bug

**POST** `/api/feedback/bug-report`

Submits a bug report. Triggered by the "Report bug" button in the sidebar.

**Request Body:**
```json
{
  "description": "Bug description",
  "current_url": "/en/portfolios/uuid",
  "user_agent": "Mozilla/5.0...",
  "screenshot": "base64_encoded_image"
}
```

---

## 12. Broker Import Endpoints

### 12.1 List Available Brokers

**GET** `/api/brokers`

Returns a list of supported brokers for import.

---

### 12.2 Connect Broker

**POST** `/api/broker-connections`

Creates a new broker connection (OAuth or API key based).

---

### 12.3 Disconnect Broker

**DELETE** `/api/broker-connections/{connectionId}`

Removes a broker connection.

---

## 13. Copilot (AI) Endpoints

### 13.1 Open Copilot Session

**POST** `/api/copilot/session`

Initiates an AI Copilot chat session. Triggered by "Open Example service Copilot" / "Ask Copilot" button visible on all pages.

**Request Body:**
```json
{
  "context": {
    "current_page": "/en/portfolios/uuid",
    "portfolio_id": "uuid"
  }
}
```

---

### 13.2 Send Copilot Message

**POST** `/api/copilot/session/{sessionId}/messages`

Sends a message to the AI copilot and returns a streamed response.

**Request Body:**
```json
{
  "message": "What moved my portfolio today?"
}
```

---

### 13.3 Get AI Portfolio Insights

**GET** `/api/portfolios/{portfolioId}/ai-insights`  
*(Premium feature — from $9.99/mo)*

Returns AI-generated insights about what drove portfolio performance. Shown as an "AI Insight" card on the Holdings tab.

---

## 14. Data Models

### Portfolio
```json
{
  "id": "UUID",
  "name": "string",
  "strategy": "string (Growth | Value | Dividend | ...)",
  "description": "string",
  "currency": "string (ISO 4217)",
  "type": "investment | cash_wallet",
  "total_value": "number",
  "total_invested": "number",
  "total_return_pct": "number",
  "unrealized_gain": "number",
  "realized_gain": "number",
  "income": "number",
  "daily_change": "number",
  "daily_change_pct": "number",
  "position_count": "integer",
  "created_at": "ISO 8601 datetime",
  "updated_at": "ISO 8601 datetime"
}
```

### Position
```json
{
  "id": "UUID",
  "portfolio_id": "UUID",
  "instrument": "Instrument object",
  "quantity": "number",
  "avg_cost": "number",
  "current_price": "number",
  "market_value": "number",
  "total_cost": "number",
  "gain_loss": "number",
  "gain_loss_pct": "number",
  "weight_pct": "number",
  "linked_wallet_id": "UUID | null",
  "transaction_count": "integer"
}
```

### Transaction
```json
{
  "id": "UUID",
  "portfolio_id": "UUID",
  "position_id": "UUID",
  "instrument": "Instrument reference",
  "date": "ISO 8601 datetime",
  "type": "Buy | Sell | Dividend",
  "quantity": "number",
  "price": "number",
  "instrument_currency": "string",
  "fees": "number",
  "fees_type": "fixed | pct",
  "exchange_rate": "number | null",
  "total_cost": "number",
  "amount": "number (negative = cash out, positive = cash in)",
  "pnl": "number | null",
  "tax_lot_method": "FIFO | LIFO | specific",
  "wallet_id": "UUID | null",
  "notes": "string"
}
```

### Instrument
```json
{
  "id": "UUID",
  "symbol": "string",
  "isin": "string",
  "name": "string",
  "type": "Stock | ETF | Crypto | Option | CFD | Index",
  "exchange": "string (US | EU | ...)",
  "currency": "string",
  "sector": "string",
  "current_price": "number",
  "logo_url": "string"
}
```

### CashWallet
```json
{
  "id": "UUID",
  "name": "string",
  "currency": "string (ISO 4217)",
  "balance": "number",
  "available_balance": "number",
  "linked_portfolio_ids": "UUID[]",
  "created_at": "ISO 8601 datetime"
}
```

### CashTransaction
```json
{
  "id": "UUID",
  "wallet_id": "UUID",
  "type": "Deposit | Withdrawal | Transfer",
  "amount": "number",
  "currency": "string",
  "transaction_date": "date",
  "description": "string",
  "payment_method": "string | null",
  "from_wallet_id": "UUID | null",
  "to_wallet_id": "UUID | null",
  "fees": "number"
}
```

### User
```json
{
  "id": "UUID",
  "email": "string",
  "first_name": "string",
  "last_name": "string",
  "language": "string (en | pl | ...)",
  "plan": "free | premium",
  "created_at": "ISO 8601 datetime"
}
```

### Watchlist
```json
{
  "id": "UUID",
  "user_id": "UUID",
  "name": "string",
  "item_count": "integer",
  "created_at": "ISO 8601 datetime"
}
```

### WatchlistItem
```json
{
  "id": "UUID",
  "watchlist_id": "UUID",
  "instrument": "Instrument object",
  "added_at": "ISO 8601 datetime"
}
```

### Alert / Notification
```json
{
  "id": "UUID",
  "user_id": "UUID",
  "type": "News | Earnings | InsiderTrade | AnalystRating",
  "ticker": "string",
  "title": "string",
  "body": "string",
  "importance": "watch | important | urgent",
  "url": "string",
  "read": "boolean",
  "created_at": "ISO 8601 datetime"
}
```

---

## 15. Resource Relationships

```
User
 ├── Portfolios (investment_portfolio)
 │    ├── Positions
 │    │    └── Transactions (Buy / Sell / Dividend)
 │    └── linked to → CashWallet (optional, via wallet_id on transactions)
 ├── CashWallets
 │    └── CashTransactions (Deposit / Withdrawal / Transfer)
 ├── Watchlists
 │    └── WatchlistItems → Instruments
 └── AlertSettings
      └── TrackedTickers → Instruments

Instrument
 ├── PriceChart (time-series)
 ├── CompanyOverview
 ├── News
 ├── Fundamentals (premium)
 ├── InvestorRelations
 ├── Projections
 ├── Ownership (premium)
 ├── Dividends (premium)
 ├── Seasonality
 └── EPSSurprises
```

**Key relationships:**
- A `Portfolio` contains many `Positions`
- A `Position` aggregates many `Transactions` (all buys/sells for one instrument in one portfolio)
- A `Transaction` can optionally link to a `CashWallet` (cash is debited/credited on buy/sell/dividend)
- A `CashWallet` can be shared between multiple portfolios
- Deleting a `Portfolio` deletes its `Positions` and `Transactions`, and deletes the linked `CashWallet` unless it is shared
- Removing a `Position` permanently deletes all its transactions and attempts to return cash to the linked wallet
- `AlertSettings.tracked_tickers` covers both default system tickers (Mag-7) and user-added tickers, as well as any instrument from a position or watchlist

---

*Generated from UI analysis of Example service.ai application snapshots. All API paths and request/response schemas are inferred from observed UI behavior, form fields, navigation URLs, and dialog interactions. Actual API paths may differ — these represent the most likely REST conventions based on the observed data.*
