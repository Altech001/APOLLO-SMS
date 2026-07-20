# Luco SMS API Integration README

This file is for frontend, mobile, and third-party API integration.

Base URL:

```text
http://localhost:8000/api/v1
```

Production should use your deployed API URL with the same `/api/v1` prefix.

## Response Shape

Successful responses usually return:

```json
{
  "success": true,
  "data": {}
}
```

Errors usually return:

```json
{
  "success": false,
  "error": "message"
}
```

## Browser And Host Access

CORS is configured to allow requests from any origin. Supported request headers include:

```text
Origin
Content-Type
Accept
Authorization
X-Request-ID
X-API-Key
X-Signature
Client-ID
Client-Secret
```

Allowed HTTP methods:

```text
GET, POST, PUT, PATCH, DELETE, OPTIONS
```

## Authentication

JWT protected routes require:

```http
Authorization: Bearer <jwt_token>
```

Developer gateway routes use one of:

```http
Authorization: Bearer <developer_api_key>
X-API-Key: <developer_api_key>
```

Admin-only routes require a JWT whose user has `"role": "admin"`.

## Health

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | Public | API health check |

## Auth Routes

| Method | Route | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | `RegisterRequest` |
| GET | `/auth/verify-email?token=<token>` | Public | None |
| POST | `/auth/login` | Public | `LoginRequest` |
| POST | `/auth/forgot-password` | Public | `ForgotPasswordRequest` |
| GET | `/auth/reset-password?token=<token>` | Public | Browser form |
| POST | `/auth/reset-password` | Public | `ResetPasswordRequest` |
| POST | `/auth/resend-verification` | Public | `ResendVerificationRequest` |
| POST | `/auth/change-password` | JWT | `ChangePasswordRequest` |

Register:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "password123"
}
```

Login:

```json
{
  "email": "jane@example.com",
  "password": "password123"
}
```

Forgot password or resend verification:

```json
{
  "email": "jane@example.com"
}
```

Reset password:

```json
{
  "token": "reset-token",
  "new_password": "newpassword123"
}
```

Change password:

```json
{
  "current_password": "oldpassword",
  "new_password": "newpassword123",
  "confirm_new_password": "newpassword123"
}
```

## Security Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/security/sessions` | JWT | List current user's active sessions |
| DELETE | `/security/sessions` | JWT | Revoke all other sessions |
| DELETE | `/security/sessions/:id` | JWT | Revoke one session |
| GET | `/security/logs` | JWT | List current user's security logs |

## User Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/users` | Admin JWT | List users |
| GET | `/users/:id` | Admin JWT | Get one user |
| POST | `/users` | Admin JWT | Create user |
| PUT | `/users/:id` | Admin JWT | Update user |
| DELETE | `/users/:id` | Admin JWT | Delete user |
| POST | `/users/:id/profile-image` | JWT | Upload profile image |

Create user:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "password123",
  "role": "user",
  "sms_balance": 0
}
```

Update user:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "",
  "role": "user",
  "sms_balance": 100
}
```

Profile image upload:

```bash
curl -X POST 'http://localhost:8000/api/v1/users/1/profile-image' \
  -H 'Authorization: Bearer <jwt_token>' \
  -F 'file=@avatar.png;type=image/png'
```

## SMS Top-Up Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/users/:id/topup` | Admin JWT | Top up user SMS balance |
| GET | `/users/:id/topups` | Admin JWT | List one user's top-ups |
| GET | `/users/topups` | Admin JWT | List all top-ups |
| GET | `/users/me/topups` | JWT | List current user's top-ups |

Top up by UGX amount. `amount` is accepted as a backward-compatible alias for `amount_ugx`.

```json
{
  "amount_ugx": 10000,
  "description": "Manual top-up",
  "reference": "optional-reference"
}
```

Response `amount` is the calculated SMS credits. Response `amount_ugx` is the UGX amount charged.

## SMS Template Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/sms-templates` | JWT | Create template |
| GET | `/sms-templates` | JWT | List current user's templates |
| GET | `/sms-templates/:id` | JWT | Get one template |
| PUT | `/sms-templates/:id` | JWT | Update template |
| DELETE | `/sms-templates/:id` | JWT | Delete template |

Create or update template:

```json
{
  "name": "OTP",
  "category": "Authentication",
  "body": "Your verification code is {code}"
}
```

## Notification Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/notifications` | JWT | List notifications |
| GET | `/notifications/unread` | JWT | List unread notifications |
| GET | `/notifications/unread/count` | JWT | Count unread notifications |
| PUT | `/notifications/:id/read` | JWT | Mark one notification as read |
| PUT | `/notifications/read-all` | JWT | Mark all notifications as read |

## SMS Sending Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/sms-config/send` | JWT | Send SMS from the authenticated user's balance |
| POST | `/gateway/send` | Developer API key | Send SMS using a developer key |

Send SMS:

```json
{
  "message": "Hello from Luco SMS",
  "phones": ["0708215305"]
}
```

You may send one phone:

```json
{
  "message": "Hello",
  "phone": "0708215305"
}
```

The send flow deducts SMS credits, creates `sms_jobs`, stores `sms_messages`, records a `payment_transactions` debit row, and creates `sms_delivery_logs`.

Gateway curl:

```bash
curl -X POST 'http://localhost:8000/api/v1/gateway/send' \
  -H 'X-API-Key: <developer_api_key>' \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello","phones":["0708215305"]}'
```

## SMS Config Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/sms-config` | Admin JWT | Get provider config |
| PUT | `/sms-config` | Admin JWT | Save provider config |
| GET | `/sms-config/balance` | Admin JWT | Check JulySMS balance |
| GET | `/sms-config/delivery-logs?limit=100` | Admin JWT | List delivery logs |
| GET | `/sms-config/failed-jobs?limit=100` | Admin JWT | List failed queue jobs |
| GET | `/sms-config/usage-summary` | Admin JWT | SMS and payment summary |
| POST | `/sms-config/webhooks/julysms` | Public with signature | JulySMS delivery webhook |

Save config:

```json
{
  "active_provider": "local",
  "cost_per_segment": 31,
  "queue_batch_size": 100,
  "julysms_client_id": "",
  "julysms_client_secret": "",
  "julysms_sender_id": "",
  "at_username": "",
  "at_api_key": "",
  "at_sender_id": ""
}
```

Allowed providers:

```text
local
julysms
africastalking
```

Provider secrets are encrypted before storage and masked in responses.

## SMS Pricing Range Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/sms-config/pricing-ranges` | Admin JWT | List pricing ranges |
| POST | `/sms-config/pricing-ranges` | Admin JWT | Replace pricing ranges |
| PUT | `/sms-config/pricing-ranges` | Admin JWT | Replace pricing ranges |
| GET | `/sms-pricing-ranges` | Admin JWT | Alias |
| POST | `/sms-pricing-ranges` | Admin JWT | Alias |
| PUT | `/sms-pricing-ranges` | Admin JWT | Alias |
| GET | `/sms_pricing_ranges` | Admin JWT | Alias |
| POST | `/sms_pricing_ranges` | Admin JWT | Alias |
| PUT | `/sms_pricing_ranges` | Admin JWT | Alias |

Save pricing ranges:

```json
[
  {
    "min_amount": 500,
    "max_amount": 9999,
    "price_per_sms": 32
  },
  {
    "min_amount": 10000,
    "max_amount": 50000,
    "price_per_sms": 30
  },
  {
    "min_amount": 50001,
    "max_amount": null,
    "price_per_sms": 27
  }
]
```

Ranges cannot overlap. Only the final range should have `max_amount: null`.

## Developer Key Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/developer-keys` | JWT | Create a developer API key |
| GET | `/developer-keys` | JWT | List current user's keys |
| DELETE | `/developer-keys/:id` | JWT | Revoke a key |

Create key:

```json
{
  "name": "Production integration"
}
```

The raw key is only returned once. Store it securely.

## Payment Routes

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/payments/collections` | JWT | Start MarzPay collection |
| GET | `/payments/collections/:reference` | JWT | Get one collection |
| GET | `/payments/transactions?limit=100` | Admin JWT | List payment transactions |
| POST | `/payments/withdrawals` | Admin JWT | Create withdrawal record |
| POST | `/payments/webhooks/marzpay` | Public | MarzPay callback |

Create collection:

```json
{
  "amount_ugx": 10000,
  "phone_number": "0708215305",
  "method": "mobile_money",
  "description": "Buy SMS credits"
}
```

Create withdrawal:

```json
{
  "amount_ugx": 10000,
  "phone_number": "0708215305",
  "description": "Withdrawal"
}
```

When a MarzPay collection completes, the webhook credits the user SMS balance and creates an SMS top-up record.

## Storage And Profile Images

Set local uploads:

```env
STORAGE_PROVIDER=local
```

Set Cloudflare R2/S3-compatible uploads:

```env
STORAGE_PROVIDER=s3
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=
```

`STORAGE_PROVIDER=r2` also works as an alias for `s3`.

## Useful Curl Examples

Login:

```bash
curl -X POST 'http://localhost:8000/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@lucosms.com","password":"adminpassword"}'
```

Set pricing:

```bash
curl -X PUT 'http://localhost:8000/api/v1/sms-pricing-ranges' \
  -H 'Authorization: Bearer <jwt_token>' \
  -H 'Content-Type: application/json' \
  -d '[{"min_amount":500,"max_amount":9999,"price_per_sms":32},{"min_amount":10000,"max_amount":50000,"price_per_sms":30},{"min_amount":50001,"max_amount":null,"price_per_sms":27}]'
```

Top up:

```bash
curl -X POST 'http://localhost:8000/api/v1/users/1/topup' \
  -H 'Authorization: Bearer <jwt_token>' \
  -H 'Content-Type: application/json' \
  -d '{"amount_ugx":10000,"description":"Manual top-up","reference":"manual-10000"}'
```

Send SMS:

```bash
curl -X POST 'http://localhost:8000/api/v1/sms-config/send' \
  -H 'Authorization: Bearer <jwt_token>' \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello","phones":["0708215305"]}'
```

Upload profile image:

```bash
curl -X POST 'http://localhost:8000/api/v1/users/1/profile-image' \
  -H 'Authorization: Bearer <jwt_token>' \
  -F 'file=@avatar.png;type=image/png'
```
