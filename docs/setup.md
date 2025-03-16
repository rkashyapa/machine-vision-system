# Machine Vision System Setup

## Prerequisites
- Docker and Docker Compose
- Git

## Installation
1. Clone the repository
2. Run `docker-compose up` to start all services
3. Access the frontend at http://localhost:3000

## Development Setup
### Frontend
```
cd frontend
npm install
npm run dev
```

### Middleware
```
cd middleware
pip install -r requirements.txt
python app.py
```

### Backend
```
cd backend
pip install -r requirements.txt
python main.py
```
