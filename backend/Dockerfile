# ── Build Stage ──
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Cache go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server ./cmd/api

# ── Runtime Stage ──
FROM alpine:3.19

WORKDIR /app

# Install CA certs for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Copy binary from builder
COPY --from=builder /app/server .
COPY --from=builder /app/.env.example .env

EXPOSE 8000

CMD ["./server"]
