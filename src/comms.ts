import type { Kernel } from '@jupyterlab/services';

export const COMM_TARGET = 'xeus-r.htmlwidget';

export function registerCommTarget(
  kernel: Kernel.IKernelConnection
): void {
  kernel.registerCommTarget(COMM_TARGET, (comm, msg) => {
    console.log('htmlwidget comm opened:', comm.commId);
    console.log('comm_open data:', msg.content.data);

    comm.onMsg = msg => {
      console.log('htmlwidget comm message:', msg.content.data);
    };

    comm.onClose = () => {
      console.log('htmlwidget comm closed:', comm.commId);
    };
  });
}