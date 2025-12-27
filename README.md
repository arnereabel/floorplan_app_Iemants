# Task Distribution App

A simplified task distribution application. Uses a Node.js backend with SQLite storage and a vanilla JavaScript frontend.

## Features

- 20 workplace floorplan grid
- Assign workers to workplaces
- Add task descriptions
- Upload photos and PDFs (Project, Phase, Drawing)
- Print task details
- Data persists in a SQLite database
- Multiple shifts support (Day, Evening, Night)

## Architecture

- **Frontend**: Single HTML file (`index.html`) with Tailwind CSS and embedded JavaScript.
- **Backend**: Node.js + Express API (`backend/server.js`).
- **Storage**: SQLite database (`backend/data/tasks.db`) and local file storage for uploads.
- **Deployment**: Docker + Docker Compose.

## Project Structure

```
task_app/
├── index.html              # Frontend application
├── nginx.conf              # Nginx configuration with API proxy
├── docker-compose.yml      # Docker orchestration
├── backend/
│   ├── server.js          # Express API server
│   ├── package.json       # Node dependencies
│   ├── Dockerfile         # Backend container
│   ├── data/              # SQLite database (auto-created)
│   └── uploads/           # File uploads (auto-created)
```

## Local Testing

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (for containerized deployment)

### Option 1: Run with Docker Compose (Recommended)
```bash
# From project root
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

Access at: http://localhost

### Option 2: Run Backend Manually (Development)
```bash
# Install dependencies
cd backend
npm install

# Start server
npm start
# or with auto-reload:
npm run dev
```

Then open `index.html` in a browser (or use a local server like `python -m http.server 8000`).

## VPS Deployment

### Prerequisites on VPS
- Docker Engine installed
- Docker Compose installed
- Port 80 available (or modify docker-compose.yml for different port)

### Step 1: Transfer Files
```bash
# From your local machine, copy all required files
scp -r backend js docker-compose.yml nginx.conf index.html user@your-vps-ip:~/task_app/
```

### Step 2: Deploy on VPS
```bash
# SSH into VPS
ssh user@your-vps-ip

# Navigate to project
cd ~/task_app

# Build and start containers (first time - will build backend image)
docker-compose up -d --build

# For subsequent restarts (no rebuild needed)
docker-compose up -d

# Check status
docker ps
docker-compose logs -f
```

### Step 3: Verify Deployment
```bash
# Check if containers are running
docker ps

# Test API health endpoint
curl http://localhost/api/health

# View logs if issues occur
docker-compose logs backend
docker-compose logs nginx
```

### Updating the Application
```bash
# On your local machine - transfer updated files
scp -r backend js docker-compose.yml nginx.conf index.html user@your-vps-ip:~/task_app/

# On VPS - rebuild and restart
ssh user@your-vps-ip
cd ~/task_app
docker-compose down
docker-compose up -d --build
```

### Data Backup
```bash
# Backup database and uploads from VPS
docker cp task_backend:/app/data ./backup_data
docker cp task_backend:/app/uploads ./backup_uploads
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/workplaces` | Get all workplace names |
| PUT | `/api/workplaces/:id` | Update workplace name |
| GET | `/api/shifts/:shift/tasks` | Get all tasks for shift |
| GET | `/api/shifts/:shift/tasks/:taskId` | Get specific task |
| PUT | `/api/shifts/:shift/tasks/:taskId` | Update task |
| POST | `/api/shifts/:shift/tasks/:taskId/photos` | Upload photo |
| POST | `/api/shifts/:shift/tasks/:taskId/pdf/:type` | Upload PDF |
| POST | `/api/floorplan/upload` | Upload floorplan image |

## Data Storage

Data is stored in a SQLite database:
- `backend/data/tasks.db`

File uploads are stored in:
- `backend/uploads/`

Data persists via Docker volume `backend_data`.

## Troubleshooting

### Backend not starting
```bash
docker logs task_backend
```

### API not accessible
- Check if backend container is running: `docker ps`
- Check logs: `docker-compose logs backend`
- Verify port 3001 is not used by another service

### Frontend can't connect to API
- Open browser console (F12)
- Check for CORS errors
- Verify nginx proxy configuration

## Future Enhancements

- [ ] Add shift selector UI (day/evening/night)
- [ ] User authentication
- [ ] Real-time updates with WebSockets
