# SurveyPro Frontend

Modern, mobile-first frontend for SurveyPro - A professional surveying and CAD application.

## Tech Stack

- **Vue 3**: Progressive JavaScript framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **TailwindCSS**: Utility-first CSS framework
- **Pinia**: State management
- **Axios**: HTTP client
- **Vue Router**: Client-side routing
- **Leaflet**: Map visualization (optional)

## Features

- 🎨 Modern, high-contrast UI optimized for field use
- 📱 Mobile-first responsive design
- 🗺️ Interactive map visualization
- 📊 Survey computations (COGO, traverse, area)
- 📁 Project and data management
- 🔐 JWT-based authentication
- 🎯 Touch-friendly interface (44px minimum touch targets)

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file (or copy from `.env.sample`):
   ```
   VITE_API_URL=http://localhost:3042/api
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   
   The app will be available at `http://localhost:5173`

4. **Build for Production**
   ```bash
   npm run build
   ```

5. **Preview Production Build**
   ```bash
   npm run preview
   ```

## Project Structure

```
frontend/
├── src/
│   ├── assets/           # Static assets
│   ├── components/       # Reusable components
│   │   ├── AppLayout.vue
│   │   └── icons/        # Icon components
│   ├── router/           # Vue Router configuration
│   ├── stores/           # Pinia stores
│   │   ├── auth.ts       # Authentication state
│   │   └── projects.ts   # Projects state
│   ├── services/         # API services
│   │   └── api.ts        # Axios instance
│   ├── types/            # TypeScript types
│   ├── views/            # Page components
│   ├── App.vue           # Root component
│   ├── main.ts           # App entry point
│   └── style.css         # Global styles
├── public/               # Public assets
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── tailwind.config.js    # Tailwind configuration
├── tsconfig.json         # TypeScript configuration
└── package.json
```

## Color Scheme

The application uses a field-optimized color scheme with high contrast for outdoor visibility:

- **Primary**: Blue tones (#1890ff) - Primary actions and navigation
- **Success**: Green (#52c41a) - Positive feedback
- **Warning**: Orange (#faad14) - Caution
- **Error**: Red (#f5222d) - Errors and destructive actions

## Development Guidelines

1. **Mobile-First**: Always design for mobile devices first
2. **Touch Targets**: Minimum 44px × 44px for all interactive elements
3. **High Contrast**: Ensure text is readable in bright outdoor conditions
4. **Offline Support**: Consider offline capabilities for field use
5. **Performance**: Optimize for slower network connections

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Lint and fix code

## API Integration

The frontend communicates with the backend API via Axios. All API calls include:
- JWT token authentication (from localStorage)
- Automatic token refresh on 401 errors
- CORS support
- Error handling

## Deployment

The frontend is configured for deployment on Render.com as a static site:

1. Build command: `npm run build`
2. Publish directory: `dist`
3. Environment variables: `VITE_API_URL`

See the root `render.yaml` for deployment configuration.
