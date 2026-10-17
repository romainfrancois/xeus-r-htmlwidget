import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';
import { getComm, subscribe } from './comms';
import { ensureRuntime } from './runtime';
import { loadDependencies } from './dependencies';
import { ensureShiny, setInputHandler, getOutputBindingForElement, dispatchCustomMessage } from './shiny';
import type { JSONValue } from '@lumino/coreutils';

export const MIME_TYPE =
  'application/vnd.jupyter.r-htmlwidget+json';

declare global {
  interface Window {
    HTMLWidgets: {
      widget: (definition: any) => void;
      widgets: Array<{ name: string }>;
      staticRender: () => void;
      getInstance: (element: HTMLElement) => any;
    };
  }
}

ensureShiny();

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
    
    setInputHandler((name, value) => {
      comm.send({
        method: 'input',
        name,
        value: JSON.parse(JSON.stringify(value)) as JSONValue
      });
    });

    // Subscribe before sending init
    this.unsubscribe = subscribe(data.comm_id, message => {

        switch (message.method) {
          case 'init': {
            this.node.innerHTML = message.payload;
          
            const el = this.node.querySelector<HTMLElement>('.html-widget');
            if (!el) {
              break;
            }
            
            const script = this.node.querySelector<HTMLScriptElement>(
              `script[data-for="${el.id}"]`
            );

            if (!script?.textContent) {
              break;
            }

            el.classList.add('html-widget-output', 'shiny-bound-output');

            const binding = getOutputBindingForElement(el);

            if (!binding) {
              console.warn(`No output binding for ${el.id}`);
              break;
            }
            
            const data = JSON.parse(script.textContent);
          
            binding.renderValue(el, {
              ...data,
              deps: []
            });
          
            break;
          }

          case 'dependencies':
            void loadDependencies(message)
              .then(() => {
                console.log('HTMLWidget dependencies loaded', message);
                comm.send({ method: 'init' });
              })
              .catch(error => {
                console.error('HTMLWidget dependency loading failed:', error);
              });
            break;

          case 'custom': {
            dispatchCustomMessage(message.type, message.message);
            break;
          }
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