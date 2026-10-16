import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';
import { getComm, subscribe } from './comms';
import { ensureRuntime } from './runtime';
import { loadDependencies } from './dependencies';

export const MIME_TYPE =
  'application/vnd.jupyter.r-htmlwidget+json';

declare global {
  interface Window {
    HTMLWidgets: {
      widget: (definition: any) => void;
      staticRender: () => void;
      getInstance: (element: HTMLElement) => any;
    };
  }
}

export class HTMLWidgetRenderer
  extends Widget
  implements IRenderMime.IRenderer {

  private unsubscribe?: () => void;

  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    // Remove any previous subscription
    this.unsubscribe?.();

    const data = model.data[MIME_TYPE] as
      unknown as { comm_id: string };

    const comm = getComm(data.comm_id);

    if (!comm) {
        this.node.textContent = 'HTML widget comm not found';
        return;
    }

    await ensureRuntime(
      () => {
        comm.send({ method: 'runtime' });
      },
      callback => subscribe(data.comm_id, message => {
        if (message.method === 'runtime') {
          callback(message.content);
        }
      })
    );
    
    // Subscribe before sending init
    this.unsubscribe = subscribe(data.comm_id, message => {

        switch (message.method) {
            case 'init':
                console.log('HTMLWidget init:', message.payload);

                this.node.innerHTML = message.payload;
                window.HTMLWidgets.staticRender();
                
                break;

            case 'dependencies':
              void loadDependencies(message)
                .then(() => {
                  console.log('HTMLWidget dependencies loaded');
                  comm.send({ method: 'init' });
                })
                .catch(error => {
                  console.error('HTMLWidget dependency loading failed:', error);
                });
              break;
        };

    });

    comm.send({
        method: 'dependencies'
    });

  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    super.dispose();
  }

}

export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: false,
  mimeTypes: [MIME_TYPE],
  createRenderer: () => new HTMLWidgetRenderer()
};