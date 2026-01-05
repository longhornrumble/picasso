# Initial Setup Guide

## What's in This Directory

This directory contains the initial files for your `picasso-config-builder` repo.

### Files Included:

```
picasso-config-builder-init/
├── README.md                           # Project overview and documentation
├── package.json                        # Dependencies and scripts
├── .gitignore                          # Git ignore rules
├── INITIAL_SETUP.md                    # This file
└── docs/
    ├── WEB_CONFIG_BUILDER_PRD.md      # Product requirements (v1.2)
    ├── TENANT_CONFIG_SCHEMA.md        # Config schema (v1.3)
    └── wireframes/
        ├── branch-editor-wireframe-v2.html
        ├── cta-editor-wireframe-v2.html
        └── form-editor-wireframe-v2.html
```

## Next Steps

### 1. Navigate to your local clone

```bash
cd ~/path/to/picasso-config-builder
```

### 2. Copy these files into your repo

```bash
# From Working_Folder directory
cp -r picasso-config-builder-init/* ~/path/to/picasso-config-builder/
```

Or manually copy the files from `picasso-config-builder-init/` to your cloned repo.

### 3. Create initial commit

```bash
cd ~/path/to/picasso-config-builder

# Add all files
git add .

# Commit with message
git commit -m "Initial project setup

- Add project README with overview and roadmap
- Add package.json with React 18, TypeScript, Vite stack
- Add .gitignore for Node.js project
- Add PRD v1.2 and Config Schema v1.3 documentation
- Add wireframes (Branch, CTA, Form editors) with green theme
- Set up docs directory structure

Ready for MVP Phase 1 development."

# Push to GitHub
git push origin main
```

### 4. Install dependencies

```bash
npm install
```

### 5. Create environment file

Create `.env.local`:

```env
VITE_S3_BUCKET=myrecruiter-picasso
VITE_API_URL=https://api.yourapi.com
VITE_AWS_REGION=us-east-1
```

### 6. Create basic Vite + React project structure

```bash
# Create src directory structure
mkdir -p src/{components/{BranchEditor,CTAEditor,FormEditor,shared},hooks,lib/{schemas,validation,s3},types}

# Create basic index.html
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Picasso Config Builder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

# Create vite.config.ts
cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
EOF

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

# Create tsconfig.node.json
cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

# Create tailwind.config.js
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4CAF50',
          hover: '#45a049',
        },
      },
    },
  },
  plugins: [],
}
EOF

# Create postcss.config.js
cat > postcss.config.js << 'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# Create src/main.tsx
cat > src/main.tsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# Create src/App.tsx
cat > src/App.tsx << 'EOF'
function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            🎨 Picasso Config Builder
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Conversational Forms Configuration Tool
          </p>
        </header>

        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-4">
            Welcome to Picasso Config Builder
          </h2>
          <p className="text-gray-600 mb-6">
            This tool helps you configure conversational forms, CTAs, and conversation branches.
          </p>
          <div className="inline-flex gap-4">
            <button className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg font-medium transition-colors">
              Get Started
            </button>
            <button className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              View Docs
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
EOF

# Create src/index.css
cat > src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
EOF
```

### 7. Test the development server

```bash
npm run dev
```

Visit `http://localhost:5173` to see your app running.

### 8. Commit the project structure

```bash
git add .
git commit -m "feat: Add Vite + React + TypeScript project scaffold

- Configure Vite with React plugin
- Set up TypeScript with strict mode
- Configure Tailwind CSS with green theme
- Create basic App component with welcome screen
- Add project directory structure for components

Ready to start building editors."

git push origin main
```

## What's Next?

Follow the roadmap in `README.md`:

**MVP Phase 1:**
1. Build Branch Editor component
2. Build CTA Editor component
3. Build Form Editor component
4. Implement validation engine
5. Add S3 integration
6. Deploy to internal URL

Refer to the wireframes in `docs/wireframes/` for exact UI specifications.

---

**Happy coding! 🚀**
