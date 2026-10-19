
import type { DependenciesMessage } from './comms';

const scripts = new Map<string, Promise<void>>();
const stylesheets = new Set<string>();

function blobURL(content: string, type: string): string {
  const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type }));
}


function loadScript(path: string, content: string): Promise<void> {
  const key = `${path}:${content}`;

  const existing = scripts.get(key);
  if (existing) {
    console.log('[dependencies] cached:', path);
    return existing;
  }

  console.log('[dependencies] loading:', path);

  const promise = new Promise<void>((resolve, reject) => {
    const url = blobURL(content, 'text/javascript');
    const script = document.createElement('script');

    script.src = url;

    script.onload = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    script.onerror = () => {
      URL.revokeObjectURL(url);
      script.remove();
      reject(new Error(`Failed to load script: ${path}`));
    };

    document.head.appendChild(script);
  }).catch(error => {
    scripts.delete(key);
    throw error;
  });

  scripts.set(key, promise);
  return promise;
}

function loadStylesheet(path: string, content: string): void {
  const key = `${path}:${content}`;

  if (stylesheets.has(key)) {
    console.log('[dependencies] cached stylesheet:', path);
    return;
  }

  console.log('[dependencies] loading stylesheet:', path);

  const url = blobURL(content, 'text/css');
  const link = document.createElement('link');

  link.rel = 'stylesheet';
  link.href = url;

  link.onload = () => {
    URL.revokeObjectURL(url);
  };

  link.onerror = () => {
    URL.revokeObjectURL(url);
    stylesheets.delete(key);
    link.remove();
    console.warn(`Failed to load stylesheet: ${path}`);
  };

  stylesheets.add(key);
  document.head.appendChild(link);
}

export async function loadDependencies(
  message: DependenciesMessage
): Promise<void> {
  for (const file of message.stylesheets) {
    loadStylesheet(file.path, file.content);
  }

  for (const file of message.scripts) {
    await loadScript(file.path, file.content);
  }
}
