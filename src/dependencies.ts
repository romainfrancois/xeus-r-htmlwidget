import type { DependenciesMessage } from './comms';

function decode(content: string, type: string): string {
  const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type }));
}

export async function loadDependencies(
  message: DependenciesMessage
): Promise<void> {
  for (const file of message.stylesheets) {
    const url = decode(file.content, 'text/css');
    const link = document.createElement('link');

    link.rel = 'stylesheet';
    link.href = url;

    document.head.appendChild(link);
  }

  for (const file of message.scripts) {
    const url = decode(file.content, 'text/javascript');

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');

      script.src = url;
      script.onload = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      script.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load ${file.path}`));
      };

      document.head.appendChild(script);
    });
  }
}