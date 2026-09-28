# Deploying to the VPS with GitHub Actions

Every push to `main` automatically:

1. Copies the repo to the VPS (`~/APOLLO-SMS`) over SSH using your `.pem` key
2. Rebuilds the frontend (`apollosms/dist`) on the VPS
3. Rebuilds the Go backend binary (`backend/bin/app`) on the VPS
4. Restarts the `apollosms-api` service and reloads nginx

Files on the VPS that are **never overwritten**: `.env` files, `node_modules`, `apollosms/dist` (rebuilt instead), `backend/bin` (rebuilt instead). Files that exist only on the VPS are not deleted.

Files involved:

- [.github/workflows/deploy.yml](.github/workflows/deploy.yml) – the GitHub Action
- [scripts/deploy.sh](scripts/deploy.sh) – runs on the VPS to build and restart

---

## 1. Add secrets to GitHub

Go to **GitHub repo → Settings → Secrets and variables → Actions → Secrets → New repository secret**:

| Name          | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| `VPS_SSH_KEY` | Full contents of `lucosms.pem` (see below)                 |
| `VPS_HOST`    | `ec2-16-192-153-173.eu-north-1.compute.amazonaws.com`      |
| `VPS_USER`    | `ubuntu`                                                   |

Copy the key contents:

```bash
cat ~/Downloads/lucosms.pem
```

Paste everything, including the `-----BEGIN ...-----` and `-----END ...-----` lines.

## 2. Optional variable

Under the **Variables** tab (same page) you can set `APP_DIR` if the app is not in `~/APOLLO-SMS` on the VPS.

## 3. Make sure the VPS can build

SSH into the VPS once and check the tools are available:

```bash
ssh -i ~/Downloads/lucosms.pem ubuntu@ec2-16-192-153-173.eu-north-1.compute.amazonaws.com
go version
node -v
pnpm -v   # or npm -v
```

The script looks for Go in `/usr/local/go/bin` and loads `nvm` if it is installed. If `pnpm` is missing it falls back to `npm`.

Your `.env` files must already be on the VPS:

- `~/APOLLO-SMS/backend/.env`
- `~/APOLLO-SMS/apollosms/.env` (Vite reads `VITE_*` values at build time)

## 4. What runs on the VPS

`scripts/deploy.sh` runs the same commands you run by hand:

```bash
# frontend
cd ~/APOLLO-SMS/apollosms
pnpm install --frozen-lockfile
NODE_OPTIONS="--max-old-space-size=2048" pnpm run build

# backend
cd ~/APOLLO-SMS/backend
go build -buildvcs=false -ldflags="-s -w" -o bin/app ./cmd/api

# restart
sudo systemctl restart apollosms-api
sudo systemctl reload nginx
```

The backend is built to `bin/app.new` first and then renamed, so the running binary is never half-written. If `apollosms-api` is not running after the restart, the deploy fails and prints the last 30 log lines.

## 5. pnpm lockfile integrity

pnpm 11 on the VPS refuses packages that have no checksum in `pnpm-lock.yaml`. `xlsx` is installed from a URL (`cdn.sheetjs.com`), so its entry has no `integrity` field and the install fails with `ERR_PNPM_MISSING_TARBALL_INTEGRITY`.

Fix it once, locally, then commit the lockfile. Either regenerate the lockfile with a pnpm version that records the checksum:

```bash
cd apollosms
pnpm add -g pnpm@latest
pnpm install
git add pnpm-lock.yaml
```

or add the checksum yourself. Compute it from the tarball:

```bash
curl -sL https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz | openssl dgst -sha512 -binary | base64 -w0
```

and edit the `xlsx@https://cdn.sheetjs.com/...` entry in `pnpm-lock.yaml`:

```yaml
    resolution: {integrity: sha512-<value from above>, tarball: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz}
```

## 6. Deploy

```bash
git add .
git commit -m "your change"
git push origin main
```

Watch progress in **GitHub → Actions → Deploy to VPS**. You can also trigger it manually there with **Run workflow**.

## Troubleshooting

| Error | Fix |
| ----- | --- |
| `Permission denied (publickey)` | `VPS_SSH_KEY` is wrong or missing the BEGIN/END lines; check `VPS_USER` is `ubuntu` |
| `ssh-keyscan` / connection timeout | EC2 security group must allow port 22 from anywhere (GitHub runner IPs change) |
| `go: command not found` | Install Go on the VPS or add its path to `PATH` in `scripts/deploy.sh` |
| `pnpm: command not found` / `node` missing | Install Node on the VPS, or add its path in `scripts/deploy.sh` |
| `ERR_PNPM_MISSING_TARBALL_INTEGRITY` | See section 5 |
| `sudo: a password is required` | The `ubuntu` user needs passwordless sudo (default on EC2) |
| Frontend using wrong API URL | Update `~/APOLLO-SMS/apollosms/.env` on the VPS and push again |
