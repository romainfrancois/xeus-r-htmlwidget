import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';

import { WidgetCommRegistry } from './comms';

export const MIME_TYPE =
  'application/vnd.xeus-r.htmlwidget+json';

export class HTMLWidgetRenderer
  extends Widget
  implements IRenderMime.IRenderer {

  constructor(private registry: WidgetCommRegistry) {
    super();
  }

  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[MIME_TYPE] as
      unknown as { comm_id: string };

    const found = this.registry.has(data.comm_id);

    this.node.textContent = found
      ? `htmlwidget comm found: ${data.comm_id}`
      : `htmlwidget comm not found: ${data.comm_id}`;
  }
}

export function createRendererFactory(
  registry: WidgetCommRegistry
): IRenderMime.IRendererFactory {
  return {
    safe: false,
    mimeTypes: [MIME_TYPE],
    createRenderer: () => new HTMLWidgetRenderer(registry)
  };
}