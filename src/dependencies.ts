import type { DependenciesMessage } from './comms';

const scripts = new Map<string, Promise<void>>();
const stylesheets = new Map<string, Promise<void>>();

function loadScript(url: string): Promise<void> {
  const existing = scripts.get(url);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = false;

    script.onload = () => resolve();

    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed to load script: ${url}`));
    };

    document.head.appendChild(script);
  }).catch(error => {
    scripts.delete(url);
    throw error;
  });

  scripts.set(url, promise);
  return promise;
}

function loadStylesheet(url: string): Promise<void> {
  const existing = stylesheets.get(url);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;

    link.onload = () => resolve();

    link.onerror = () => {
      link.remove();
      reject(new Error(`Failed to load stylesheet: ${url}`));
    };

    document.head.appendChild(link);
  }).catch(error => {
    stylesheets.delete(url);
    throw error;
  });

  stylesheets.set(url, promise);
  return promise;
}

export async function loadDependencies(
  message: DependenciesMessage
): Promise<void> {
  for (const dependency of message.dependencies) {
    await Promise.all(
      dependency.stylesheets.map(loadStylesheet)
    );

    for (const url of dependency.scripts) {
      await loadScript(url);
    }
  }
}
