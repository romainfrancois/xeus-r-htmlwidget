import { PageConfig } from '@jupyterlab/coreutils';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import type { Kernel } from '@jupyterlab/services';
import type { JSONValue } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import { getComm, subscribe, subscribeClose } from './comms';
import type { Dependency } from './comms';
import type { FrameInit, FrameMessage, RendererMessage } from './frameprotocol';

export const MIME_TYPE = 'application/vnd.jupyter.r-htmlwidget+json';

const bootstrapUrl = new URL('../r/inst/widget/frame.js', import.meta.url);
let nextFrameNumber = 0;

function isLoopback(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
}

function localHeraFrame(frameUrl?: string): URL | undefined {
  if (!frameUrl || !isLoopback(window.location.hostname)) {
    return;
  }
  try {
    const url = new URL(frameUrl);
    if (
      url.protocol === 'http:' &&
      isLoopback(url.hostname) &&
      url.origin !== window.location.origin
    ) {
      return url;
    }
  } catch {
    // An invalid or unavailable Hera URL leaves the inline iframe enabled.
  }
}

function attribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export class HTMLWidgetRenderer
  extends Widget
  implements IRenderMime.IRenderer
{
  private comm?: Kernel.IComm;
  private unsubscribe?: () => void;
  private unsubscribeClose?: () => void;
  private disposeFrame?: () => void;
  private disconnectFrame?: () => void;

  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    this.disposeView();

    const configuredUrl = PageConfig.getOption('rHtmlWidgetFrameUrl');
    const hostedUrl = configuredUrl ? new URL(configuredUrl) : undefined;
    if (
      hostedUrl &&
      (!['https:', 'http:'].includes(hostedUrl.protocol) ||
        hostedUrl.origin === window.location.origin)
    ) {
      throw new Error('The widget frame must use a separate HTTP(S) origin');
    }

    const data = model.data[MIME_TYPE] as unknown as { comm_id: string };
    const comm = getComm(data.comm_id);

    if (!comm) {
      this.node.textContent = 'HTML widget comm not found';
      return;
    }

    this.comm = comm;
    this.unsubscribeClose = subscribeClose(data.comm_id, () =>
      this.disposeView()
    );

    let runtime: string | undefined;
    let dependencies: Dependency[] | undefined;
    let heraUrl: URL | undefined;
    let widgetName = 'widget';
    let sendCustom: ((message: RendererMessage) => void) | undefined;
    const pendingCustom: RendererMessage[] = [];

    this.unsubscribe = subscribe(data.comm_id, message => {
      switch (message.method) {
        case 'runtime':
          runtime = message.content;
          comm.send({ method: 'dependencies' });
          break;
        case 'dependencies':
          dependencies = message.dependencies;
          heraUrl = localHeraFrame(message.frame_url);
          if (typeof message.widget_name === 'string') {
            widgetName =
              message.widget_name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') || widgetName;
          }
          comm.send({ method: 'init' });
          break;
        case 'init':
          if (runtime !== undefined && dependencies && !sendCustom) {
            sendCustom = this.mountFrame(
              comm,
              { kind: 'init', runtime, dependencies, markup: message.payload },
              pendingCustom,
              widgetName,
              hostedUrl ?? heraUrl
            );
          }
          break;
        case 'custom': {
          const custom: RendererMessage = {
            kind: 'custom',
            type: message.type,
            message: message.message
          };
          if (sendCustom) {
            sendCustom(custom);
          } else {
            pendingCustom.push(custom);
          }
          break;
        }
      }
    });

    try {
      comm.send({ method: 'runtime' });
    } catch (error) {
      this.disposeView();
      throw error;
    }
  }

  private mountFrame(
    comm: Kernel.IComm,
    init: FrameInit,
    pendingCustom: RendererMessage[],
    widgetName: string,
    hostedUrl?: URL
  ): (message: RendererMessage) => void {
    const frame = document.createElement('iframe');
    frame.setAttribute(
      'sandbox',
      hostedUrl ? 'allow-scripts allow-same-origin' : 'allow-scripts'
    );
    const expectedOrigin = hostedUrl?.origin ?? 'null';
    frame.className = 'jp-RHTMLWidget-frame';
    frame.name = `${widgetName}-${++nextFrameNumber}`;
    frame.title = frame.name;

    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
      byte.toString(16).padStart(2, '0')
    ).join('');

    let port: MessagePort | undefined;
    let elementId: string | undefined;
    let failed = false;

    const disconnect = () => {
      port?.close();
      port = undefined;
      elementId = undefined;
    };

    // Only the bootstrap in this iframe may hand the renderer a port.
    const connect = (event: MessageEvent) => {
      if (
        !frame.isConnected ||
        event.source !== frame.contentWindow ||
        event.origin !== expectedOrigin ||
        event.data?.kind !== 'htmlwidget:connect' ||
        event.data.token !== token ||
        event.ports.length !== 1
      ) {
        return;
      }

      disconnect();
      const connection = event.ports[0];
      port = connection;
      connection.onmessage = ({ data }: MessageEvent<FrameMessage>) => {
        if (
          port !== connection ||
          this.comm !== comm ||
          !frame.isConnected ||
          !data
        ) {
          return;
        }

        switch (data.kind) {
          case 'ready':
            if (!elementId && typeof data.id === 'string' && data.id) {
              elementId = data.id;
              comm.send({ method: 'initialized', id: elementId });
              pendingCustom
                .splice(0)
                .forEach(message => connection.postMessage(message));
            }
            break;
          case 'input': {
            if (
              !elementId ||
              typeof data.name !== 'string' ||
              !data.name.startsWith(`${elementId}_`) ||
              typeof data.value !== 'string'
            ) {
              return;
            }

            let value: JSONValue;
            try {
              value = JSON.parse(data.value);
            } catch {
              return;
            }
            comm.send({ method: 'input', name: data.name, value });
            break;
          }
          case 'resize':
            if (elementId && Number.isFinite(data.height) && data.height > 0) {
              frame.height = String(Math.min(32768, Math.ceil(data.height)));
            }
            break;
          case 'error':
            if (typeof data.message === 'string') {
              failed = true;
              this.disposeFrame?.();
              this.node.textContent = `HTML widget rendering failed: ${data.message}`;
            }
            break;
        }
      };

      connection.postMessage(init);
    };

    this.disconnectFrame = disconnect;
    this.disposeFrame = () => {
      window.removeEventListener('message', connect);
      disconnect();
      pendingCustom.length = 0;
      this.disconnectFrame = undefined;
      this.disposeFrame = undefined;
      frame.remove();
    };

    window.addEventListener('message', connect);
    if (hostedUrl) {
      hostedUrl.searchParams.set('widget', frame.name);
      hostedUrl.hash = new URLSearchParams({
        parentOrigin: window.location.origin,
        token
      }).toString();
      frame.src = hostedUrl.href;
    } else {
      frame.srcdoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${frame.name}</title>
  <style>body { margin: 0 } #widget-root { display: flow-root }</style>
</head>
<body>
  <div id="widget-root"></div>
  <script src="${attribute(bootstrapUrl.href)}"
    data-parent-origin="${attribute(window.location.origin)}"
    data-token="${token}"></script>
</body>
</html>`;
    }

    this.node.replaceChildren(frame);

    return message => {
      if (failed) {
        return;
      }
      if (port && elementId) {
        port.postMessage(message);
      } else {
        pendingCustom.push(message);
      }
    };
  }

  protected onBeforeDetach(): void {
    // JupyterLab may detach an output while retaining its renderer and comm.
    // The iframe document will reconnect if the output is attached again.
    this.disconnectFrame?.();
  }

  private disposeView(): void {
    this.unsubscribeClose?.();
    this.unsubscribeClose = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.disposeFrame?.();
    this.comm = undefined;
    this.node.replaceChildren();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    const comm = this.comm;
    this.disposeView();

    try {
      comm?.close();
    } finally {
      super.dispose();
    }
  }
}

export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: false,
  mimeTypes: [MIME_TYPE],
  createRenderer: () => new HTMLWidgetRenderer()
};
