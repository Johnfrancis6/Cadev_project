import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initApi } from '@/lib/api';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import '@/styles/index.css';

/**
 * Safety net for in-browser page translation (and extensions that rewrite text): they move
 * text nodes into their own wrappers, after which React's removeChild / insertBefore throw and
 * the whole screen crashes. Tolerate nodes that are no longer where React left them.
 */
function tolerateForeignDomEdits() {
  const proto = Node.prototype;
  const removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      child.parentNode?.removeChild(child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };
  const insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) return this.appendChild(node);
    return insertBefore.call(this, node, reference) as T;
  };
}
tolerateForeignDomEdits();

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
