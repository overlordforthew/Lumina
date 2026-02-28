# Lumina — lumina.namibarden.com

90-day bilingual (Japanese/English) self-improvement audio course app.

## Stack
- Backend: Node.js/Express on port 3456
- Frontend: React 18, bundled with esbuild (src/app.jsx → public/app.js)
- Database: PostgreSQL 17 (was 16, upgraded due to data dir mismatch)
- Auth: JWT + bcryptjs
- Build: Multi-stage Docker (builder compiles JSX, production runs server)

## Structure
```
server.js      # Express API + static file server
setup-db.js    # Database setup utility
src/app.jsx    # React frontend source
public/        # Static assets + built app.js
```

## Key Patterns
- Server creates tables on startup (users, progress, audio)
- DB indices: idx_users_email, idx_progress_user_id, idx_audio_user_day
- Test user creation guarded behind NODE_ENV !== 'production'
- esbuild bundles React with --minify for production

## Deploy
Docker Compose (NOT Coolify — runs independently):
```bash
cd /projects/Lumina && docker-compose build app && docker-compose up -d
```
Note: DB container name is lumina-db, app is lumina-app.

## Database
- Container: lumina-db (postgres:17-alpine)
- User: lumina, DB: lumina, Password: lumina_change_me
- Volume: lumina_pgdata (actual Docker volume: okw0cwwgskcow8k8o08gsok0_lumina-pgdata)
- IMPORTANT: DB password was manually reset — docker-compose defaults may not match existing data

## Build Frontend
```bash
npx esbuild src/app.jsx --bundle --outfile=public/app.js --define:process.env.NODE_ENV='"production"' --minify
```
