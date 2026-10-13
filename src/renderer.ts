import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';
import { getComm, subscribe } from './comms';

export const MIME_TYPE =
  'application/vnd.jupyter.r-htmlwidget+json';

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

    // Subscribe before sending init
    this.unsubscribe = subscribe(data.comm_id, message => {

        if (message.method === 'dependencies') {
            console.log('HTMLWidget dependencies:', message.payload);

            // once dependencies are loaded, continue ...
        }

        if (message.method === 'init' && message.payload) {
            console.log('HTMLWidget HTML:', message.payload);

            // const iframe = document.createElement('iframe');

            // iframe.style.width = '100%';
            // iframe.style.height = '500px';
            // iframe.style.border = 'none';

            // iframe.srcdoc = message.payload;

            // this.node.replaceChildren(iframe);
        }
    });

    this.node.textContent = 'Loading HTML widget... ' + comm.commId;

    await comm.send({
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