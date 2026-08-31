# BSK Clinic Frontend

Frontend web application for **Baak o Shrobon Kendra** - Hearing, Nose and Speaking Centre. This application provides the user interface for clinic management, including patient registration, booking management, service catalog viewing, and dashboard analytics.

## Tech Stack

- **React** (Bootstrapped with Create React App)
- **Vanilla CSS** for styling
- **React Router** for navigation (assumed based on standard SPAs)

## Getting Started

### Prerequisites

- Node.js and npm installed
- The [BSK Clinic Backend Service](../bsk-service) running locally or accessible via URL.

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd bsk-clinic
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

The application will open in your browser at [http://localhost:3000](http://localhost:3000).

### Environment Configuration

By default, API requests are proxied to `http://localhost:9097` (as configured in `package.json`). 

To connect to a remote backend or a Cloudflare tunnel, set the `REACT_APP_API_BASE` environment variable. **Important:** The backend expects the `/api/clinic` prefix. 

Create a `.env` file in the root directory:
```env
REACT_APP_API_BASE=https://your-tunnel-url.trycloudflare.com/api/clinic
```

### Build for Production

To create a production build:
```bash
npm run build
```
This builds the app for production to the `build` folder, correctly bundling React in production mode and optimizing the build for the best performance.
