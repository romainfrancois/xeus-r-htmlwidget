import type { Kernel } from '@jupyterlab/services';

export const COMM_TARGET = 'xeus-r.htmlwidget';

export class WidgetCommRegistry {
  private comms = new Set<string>();

  constructor(kernel: Kernel.IKernelConnection) {
    kernel.registerCommTarget(COMM_TARGET, (comm, msg) => {
      console.log('htmlwidget comm opened:', comm.commId);
      this.comms.add(comm.commId);

      comm.onClose = () => {
        console.log('htmlwidget comm closed:', comm.commId);
        this.comms.delete(comm.commId);
      };
    });
  }

  has(id: string): boolean {
    return this.comms.has(id);
  }
}