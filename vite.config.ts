import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleStationApiRequest } from './server/stationApiMiddleware';
import { handlePlacesAndTrafficApiRequest } from './server/placesAndTrafficMiddleware';
import { handleQueueApiRequest } from './server/queueApiMiddleware';
import { handleOperatorApiRequest } from './server/operatorApiMiddleware';

function apiMiddlewarePlugin(): Plugin {
  return {
    name: 'api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handledStation = await handleStationApiRequest(req, res);
          if (handledStation) return;

          const handledPlacesTraffic = await handlePlacesAndTrafficApiRequest(req, res);
          if (handledPlacesTraffic) return;

          const handledQueue = await handleQueueApiRequest(req, res);
          if (handledQueue) return;

          const handledOperator = await handleOperatorApiRequest(req, res);
          if (handledOperator) return;

          next();
        } catch (err) {
          next(err);
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const handledStation = await handleStationApiRequest(req, res);
          if (handledStation) return;

          const handledPlacesTraffic = await handlePlacesAndTrafficApiRequest(req, res);
          if (handledPlacesTraffic) return;

          const handledQueue = await handleQueueApiRequest(req, res);
          if (handledQueue) return;

          const handledOperator = await handleOperatorApiRequest(req, res);
          if (handledOperator) return;

          next();
        } catch (err) {
          next(err);
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
