# SurveyPro Backend

Backend API for SurveyPro - A modern web-based surveying and CAD application.

## Tech Stack

- **Platformatic DB**: Auto-generated REST & GraphQL APIs
- **PostgreSQL**: Database with PostGIS extension
- **Node.js**: Runtime environment
- **Fastify**: Web framework (via Platformatic)

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.sample .env
   ```
   Update `.env` with your database credentials and secrets.

3. **Setup PostgreSQL with PostGIS**
   ```sql
   CREATE DATABASE surveypro;
   \c surveypro
   CREATE EXTENSION postgis;
   ```

4. **Run Migrations**
   ```bash
   npm run migrate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

## API Endpoints

- REST API: `http://localhost:3042/`
- GraphQL: `http://localhost:3042/graphql`
- OpenAPI Docs: `http://localhost:3042/documentation`

## Project Structure

```
backend/
├── migrations/          # Database migrations
├── plugins/            # Custom Platformatic plugins
├── scripts/            # Utility scripts
├── platformatic.db.json # Platformatic configuration
├── package.json
└── README.md
```

## Deployment

Configured for Render.com deployment. See `render.yaml` for configuration.
