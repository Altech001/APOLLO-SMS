# Deploying to the VPS with GitHub Actions

Every push to `main` automatically:

1. Copies the repo to the VPS (`~/APOLLO-SMS`) over SSH using your `.pem` key
2. Rebuilds the frontend (`apollosms/dist`) on the VPS
3. Rebuilds the Go backend binary (`backend/bin/app`) on the VPS
4. Restarts the backend

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

## 2. Optional variables

Under the **Variables** tab (same page):

| Name          | Default         | Purpose                                                   |
| ------------- | --------------- | --------------------------------------------------------- |
| `APP_DIR`     | `~/APOLLO-SMS`  | App folder on the VPS                                     |
| `RESTART_CMD` | *(auto-detect)* | Custom command to restart the backend, e.g. `pm2 restart api` |

Don't use single quotes (`'`) inside `RESTART_CMD`.

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

## 4. How the backend is restarted

`scripts/deploy.sh` tries, in order:

1. `RESTART_CMD` variable, if set
2. A systemd service named `apollosms`
3. A pm2 process named `apollosms`

If none exist, the deploy fails with a message. To find out how your backend is currently running:

```bash
pm2 list                                  # pm2?
systemctl list-units --type=service | grep -i apollo   # systemd?
ps aux | grep -i bin/                     # plain process?
```

### Recommended: run the backend as a systemd service

If you started the backend manually (e.g. `./bin/app &` or `nohup`), stop it and set up a service so it restarts cleanly and survives reboots:

```bash
sudo tee /etc/systemd/system/apollosms.service > /dev/null <<'EOF'
[Unit]
Description=Apollo SMS backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/APOLLO-SMS/backend
EnvironmentFile=/home/ubuntu/APOLLO-SMS/backend/.env
ExecStart=/home/ubuntu/APOLLO-SMS/backend/bin/app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now apollosms
sudo systemctl status apollosms
```

The `ubuntu` user on EC2 has passwordless `sudo` by default, so `sudo systemctl restart` works from the Action.

### Using pm2 instead

```bash
cd ~/APOLLO-SMS/backend
pm2 start ./bin/app --name apollosms
pm2 save
```

## 5. Frontend

The frontend is rebuilt in place into `~/APOLLO-SMS/apollosms/dist`. If nginx (or another web server) serves that folder, the new version is live as soon as the build finishes — no restart needed.

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
| `No restart method found` | Set up the systemd service above or set `RESTART_CMD` |
| Frontend using wrong API URL | Update `~/APOLLO-SMS/apollosms/.env` on the VPS and push again |
