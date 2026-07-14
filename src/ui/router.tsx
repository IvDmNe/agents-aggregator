import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { z } from 'zod';
import { AppShell } from './AppShell';

const searchSchema = z.object({
  source: z.string().optional(),
  project: z.string().optional(),
  q: z.string().optional(),
  // Session selected in the Home tab's detail pane (Home is a master-detail;
  // a *focused* session tab uses the /session/$id path instead).
  sel: z.string().optional(),
});

export type AppSearch = z.infer<typeof searchSchema>;

export const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: searchSchema,
  component: () => <AppShell />,
});

export const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/journal',
  validateSearch: searchSchema,
  component: () => <AppShell />,
});

export const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/board',
  validateSearch: searchSchema,
  component: () => <AppShell />,
});

export const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/session/$id',
  validateSearch: searchSchema,
  component: () => <AppShell />,
});

const routeTree = rootRoute.addChildren([indexRoute, journalRoute, boardRoute, sessionRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Keep ":" literal in path params so /session/pi:<uuid> stays readable
  // instead of being percent-encoded to /session/pi%3A<uuid>.
  pathParamsAllowedCharacters: [':'],
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
