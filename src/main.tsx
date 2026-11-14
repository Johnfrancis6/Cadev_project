import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initApi } from '@/lib/api';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import '@/styles/index.css';

async function start() {
  // Picks the live backend when configured and reachable, local data otherwise. Never rejects.
  await initApi().catch(() => undefined);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void start();
