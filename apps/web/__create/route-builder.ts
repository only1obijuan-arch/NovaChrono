import { Hono } from 'hono';
import type { Handler } from 'hono/types';
import updatedFetch from '../src/__create/fetch';

const API_BASENAME = '/api';
const api = new Hono();

if (globalThis.fetch) {
  globalThis.fetch = updatedFetch;
}

// Static route imports instead of filesystem scanning
const routeModules = [
  {
    path: '/auth/expo-web-success',
    module: () => import('../src/app/api/auth/expo-web-success/route.js'),
  },
  {
    path: '/auth/token',
    module: () => import('../src/app/api/auth/token/route.js'),
  },
  {
    path: '/__create/ssr-test',
    module: () => import('../src/app/api/__create/ssr-test/route.js'),
  },
];

async function registerRoutes() {
  api.routes = [];

  for (const { path, module } of routeModules) {
    try {
      const route = await module();
      const methods = ['GET', 'POST', 'PUT', "DELETE", 'PATCH'];

      for (const method of methods) {
        if (route[method]) {
          const handler: Handler = async (c) => {
            const params = c.req.param();
            return await route[method](c.req.raw, { params });
          };
          const m = method.toLowerCase();
          if (m === 'get') api.get(path, handler);
          else if (m === 'post') api.post(path, handler);
          else if (m === 'put') api.put(path, handler);
          else if (m === 'delete') api.delete(path, handler);
          else if (m === 'patch') api.patch(path, handler);
        }
      }
    } catch (error) {
      console.error(`Error registering route ${path}:`, error);
    }
  }
}

await registerRoutes();

export { api, API_BASENAME };