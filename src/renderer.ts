import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';

export const MIME_TYPE =
  'application/vnd.xeus-r.htmlwidget+json';

export class HTMLWidgetRenderer
  extends Widget
  implements IRenderMime.IRenderer {

  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[MIME_TYPE] as
      unknown as { comm_id: string };

    this.node.textContent = `HTML widget comm: ${data.comm_id}`;
  }
}

export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: false,
  mimeTypes: [MIME_TYPE],
  createRenderer: () => new HTMLWidgetRenderer()
};