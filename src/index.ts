import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { rendererFactory, MIME_TYPE } from './renderer';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'xeus_r_htmlwidget:plugin',
  description: 'A JupyterLab extension to display R htmlwidgets',
  autoStart: true,
  requires: [IRenderMimeRegistry],

  activate: (
    app: JupyterFrontEnd,
    rendermime: IRenderMimeRegistry
  ) => {
    rendermime.addFactory(rendererFactory, 0);

    console.log(
      'Custom MIME supported:',
      rendermime.mimeTypes.includes(MIME_TYPE)
    );
  }
};

export default plugin;