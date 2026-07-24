# Luco SMS API

Backend service for SMS delivery and customer management, built with Go + Fiber.

## Tech Stack

- **Language:** Go 1.22+
- **Framework:** [Fiber](https://gofiber.io/) v2
- **Database:** PostgreSQL
- **Docs:** Swagger (swaggo)

## Getting Started

### Prerequisites

- Go 1.22 or higher
- PostgreSQL 14+
- (optional) Docker & Docker Compose

### Installation

\`\`\`bash
git clone https://github.com/Altech001/luco-sms-api.git
cd luco-sms-api/backend
go mod tidy
cp .env.example .env
\`\`\`

Fill in `.env` with your DB credentials and API keys.

### Running locally

\`\`\`bash
go run cmd/api/main.go
\`\`\`

Server starts on `http://localhost:8000`

### Running with Docker

\`\`\`bash
docker-compose up --build
\`\`\`

## API Documentation

Once running, view interactive Swagger docs at:

\`\`\`
http://localhost:8000/swagger/index.html
\`\`\`

To regenerate docs after changing handler annotations:

\`\`\`bash
swag init -g cmd/api/main.go
\`\`\`

## Project Structure

See [Architecture](#architecture) below for folder layout and design rationale.

## Environment Variables

| Variable      | Description                  | Example                |
|---------------|-------------------------------|-------------------------|
| `PORT`        | Server port                   | `8000`                  |
| `DATABASE_URL`| Postgres connection string    | `postgres://...`        |
| `SMS_API_KEY` | Provider API key for SMS      | `your-key-here`         |
| `REDIS_ADDR`  | Optional Redis host:port for cache/queue hints | `redis.example.com:6379` |
| `MARZPAY_BASIC_AUTH` | MarzPay Basic auth token or `username:password` | `base64-token` |
| `PUBLIC_URL` | Public backend URL used for emails, uploads, and MarzPay callbacks. `PUBLIC_BASE_URL` is still supported. | `https://api.example.com` |

## Endpoints

| Method | Route                  | Description          |
|--------|--------------------------|-----------------------|
| GET    | `/api/v1/health`         | Health check          |
| GET    | `/api/v1/customers`      | List customers        |
| POST   | `/api/v1/customers`      | Create customer        |
| POST   | `/api/v1/sms/send`       | Send SMS               |

## Redis Fallback

Redis is optional. When `REDIS_ADDR` is empty or Redis is unreachable, the backend logs fallback mode and continues using PostgreSQL for authentication, balance accounting, payment records, and SMS jobs.

Redis is used only for fast user/session/payment lookup and SMS queue hints. PostgreSQL remains the source of truth, so failed Redis writes do not fail signup, login, topups, payments, or SMS sending.

## SMS Topup Pricing

Default UGX pricing bands:

| Topup amount UGX | Price per SMS |
|------------------|---------------|
| `0 - 9,999`      | `32` UGX      |
| `10,000 - 50,000`| `30` UGX      |
| `50,001+`        | `27` UGX      |

Admins can manage these bands:

```http
GET /api/v1/sms-config/pricing-ranges
PUT /api/v1/sms-config/pricing-ranges
```

Example `PUT` body:

```json
[
  { "min_amount": 0, "max_amount": 9999, "price_per_sms": 32 },
  { "min_amount": 10000, "max_amount": 50000, "price_per_sms": 30 },
  { "min_amount": 50001, "max_amount": null, "price_per_sms": 27 }
]
```

## MarzPay Collections

Preferred frontend flow:

1. Authenticated user calls `POST /api/v1/payments/collections`.
2. Backend creates a UUID `reference`, stores a pending transaction, calculates SMS credits from pricing bands, and calls MarzPay `collect-money`.
3. MarzPay sends final callbacks to `POST /api/v1/payments/webhooks/marzpay`.
4. Backend matches `transaction.reference`, credits the user exactly once when `event_type` is `collection.completed`, and records `collection.provider_transaction_id`.
5. Frontend polls `GET /api/v1/payments/collections/{reference}` for status.

Example collection request:

```json
{
  "amount_ugx": 10000,
  "phone_number": "+256700000000",
  "method": "mobile_money",
  "description": "SMS credit purchase"
}
```

Admin finance endpoints:

```http
GET /api/v1/payments/transactions
GET /api/v1/sms-config/usage-summary
POST /api/v1/payments/withdrawals
```

`POST /api/v1/payments/withdrawals` creates a local withdrawal record with a UUID reference. The actual MarzPay `send-money` API call can be connected later using that reference.

## License

Private — Bliss ISP / Luco internal project.
