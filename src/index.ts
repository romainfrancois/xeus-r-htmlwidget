import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the xeus_r_htmlwidget extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'xeus_r_htmlwidget:plugin',
  description: 'A JupyterLab extension to displat R htmlwidget',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension xeus_r_htmlwidget is activated!');
  }
};

export default plugin;
