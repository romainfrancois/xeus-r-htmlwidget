import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';
import { getComm, subscribe, subscribeClose } from './comms';
import { ensureRuntime } from './runtime';
import { loadDependencies } from './dependencies';
import { ensureShiny, setInputHandler, getOutputBindingForElement, dispatchCustomMessage, removeInputHandler } from './shiny';
import type { JSONValue } from '@lumino/coreutils';
import type { Kernel } from '@jupyterlab/services';

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

  private _comm: Kernel.IComm | null = null;
  private _elementId: string | null = null;
  private unsubscribe?: () => void;
  private unsubscribeClose?: () => void;

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
    this._comm = comm;

    this.unsubscribeClose = subscribeClose(data.comm_id, () => {
      this.disposeView();
    });

    // Subscribe before sending init
    this.unsubscribe = subscribe(data.comm_id, message => {
      if (!this.isActive(comm)) {
        return;
      }
      
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
        
          (window as any).HTMLWidgets.shinyMode = true;

          setInputHandler(el.id, (name, value) => {
            comm.send({
              method: 'input',
              name,
              value: JSON.parse(JSON.stringify(value)) as JSONValue
            });
          });

          this._elementId = el.id;

          try {
            binding.renderValue(el, {
              ...data,
              deps: []
            });
          } catch(error) {
            removeInputHandler(el.id);
            this._elementId = null;
            throw error;
          }

          comm.send({
            method: 'initialized',
            id: this._elementId
          });
        
          break;
        }

        case 'dependencies':
          void loadDependencies(message)
            .then(() => {
              if (!this.isActive(comm)) {
                return;
              }
              console.log('HTMLWidget dependencies loaded', message);
              comm.send({ method: 'init' });
            })
            .catch(error => {
              if (this.isActive(comm)) {
                console.error('HTMLWidget dependency loading failed:', error);
              }
            });
          break;

        case 'custom': {
          console.log("custom message", message);
          dispatchCustomMessage(message.type, message.message);
          break;
        }
      };
    });

    await ensureRuntime(
      () => {
        if (this.isActive(comm)) {
          comm.send({ method: 'runtime' });
        }
      },
      callback => subscribe(data.comm_id, message => {
        if (message.method === 'runtime') {
          callback(message.content);
        }
      })
    );

    if (!this.isActive(comm)) {
      return;
    }
    
    comm.send({
        method: 'dependencies'
    });

  }

  private disposeView(): void {
    this.unsubscribeClose?.();
    this.unsubscribeClose = undefined;
  
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  
    if (this._elementId) {
      removeInputHandler(this._elementId);
      this._elementId = null;
    }
  
    this._comm = null;
    this.node.replaceChildren();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    const comm = this._comm;

    this.disposeView();

    try {
      comm?.close();
    } finally {
      super.dispose();
    }
  }

  private isActive(comm: Kernel.IComm): boolean {
    return !this.isDisposed && this._comm === comm;
  }
}

export const rendererFactory: IRenderMime.IRendererFactory = {
  safe: false,
  mimeTypes: [MIME_TYPE],
  createRenderer: () => new HTMLWidgetRenderer()
};