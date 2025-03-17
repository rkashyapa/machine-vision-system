# Machine Vision System

A modular machine vision system with frontend, middleware, and backend components.

## Architecture

The system consists of:

- **Frontend**: React/Next.js web application
- **Middleware**: Flask API
- **Backend**: Core vision processing modules
  - Device: Camera and hardware interfaces
  - Inference: ML model execution
  - Post-processing: Result analysis and formatting
- **Database**: SQLite for data persistence
- **Docker**: Containerization for deployment

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Git

### Installation
1. Clone the repository
2. Run `docker-compose up` to start all services
3. Access the frontend at http://localhost:3000

## Development

See the documentation in the `docs` directory for detailed setup and development instructions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
