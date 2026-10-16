let runtimePromise: Promise<void> | undefined;

function loadRuntime(content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const binary = atob(content);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

    const blob = new Blob([bytes], {
      type: 'text/javascript'
    });

    const url = URL.createObjectURL(blob);
    const script = document.createElement('script');

    script.src = url;

    script.onload = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    script.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load htmlwidgets.js'));
    };

    document.head.appendChild(script);
  });
}

export function ensureRuntime(
  request: () => void,
  subscribe: (callback: (content: string) => void) => () => void
): Promise<void> {
  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = new Promise<void>((resolve, reject) => {
    const unsubscribe = subscribe(content => {
      unsubscribe();

      loadRuntime(content).then(resolve, reject);
    });

    try {
      request();
    } catch (error) {
      unsubscribe();
      reject(error);
    }
  });

  runtimePromise = runtimePromise.catch(error => {
    runtimePromise = undefined;
    throw error;
  });

  return runtimePromise;
}
