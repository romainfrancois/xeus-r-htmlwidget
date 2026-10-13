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

        this.node.textContent = 'Loading HTML widget... ' + comm.commId;

        switch (message.method) {
            case 'init':
                console.log('HTMLWidget init:', message.payload);
                // const iframe = document.createElement('iframe');

                // iframe.style.width = '100%';
                // iframe.style.height = '500px';
                // iframe.style.border = 'none';

                // iframe.srcdoc = message.payload;

                // this.node.replaceChildren(iframe);

                break;

            case 'dependencies':
                console.log('HTMLWidget dependencies:', message.payload);
                this.node.textContent = 'Loading HTML widget dependencies ... ' + comm.commId;
                
                for (const dep of message.payload) {
                    comm.send({
                        method: 'dependency',
                        name: dep.name,
                        version: dep.version
                    });
                }

                break;

            case 'dependency':
                console.log('HTMLWidget dependency:', message);
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