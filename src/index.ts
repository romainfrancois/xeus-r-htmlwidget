import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  INotebookTracker,
  NotebookPanel
} from '@jupyterlab/notebook';

import type { Kernel } from '@jupyterlab/services';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { rendererFactory, MIME_TYPE } from './renderer';
import { registerCommTarget } from './comms';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'xeus_r_htmlwidget:plugin',
  description: 'A JupyterLab extension to display R htmlwidgets',
  autoStart: true,
  requires: [IRenderMimeRegistry, INotebookTracker],

  activate: (
    app: JupyterFrontEnd,
    rendermime: IRenderMimeRegistry,
    notebooks: INotebookTracker
  ) => {
    // Register the MIME renderer
    rendermime.addFactory(rendererFactory, 0);

    console.log(
      'HTMLWidget MIME renderer registered:',
      rendermime.mimeTypes.includes(MIME_TYPE)
    );

    // Register the comm target for notebook kernels
    const registered = new WeakSet<Kernel.IKernelConnection>();

    const setupNotebook = async (panel: NotebookPanel) => {
      await panel.sessionContext.ready;
    
      const kernel = panel.sessionContext.session?.kernel;
    
      if (kernel && !registered.has(kernel)) {
        registerCommTarget(kernel);
        registered.add(kernel);
    
        console.log(
          'Registered htmlwidget comm target for kernel:',
          kernel.id
        );
      }
    };

    notebooks.widgetAdded.connect((_, panel) => {
      void setupNotebook(panel);
    });

    notebooks.forEach(panel => {
      void setupNotebook(panel);
    });
  }
};

export default plugin;