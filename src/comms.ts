import type { Kernel } from '@jupyterlab/services';
import type { JSONValue } from '@lumino/coreutils';

export const COMM_TARGET = 'xeus-r.htmlwidget';

export interface InitMessage {
  method: 'init';
  payload: string;
}

export interface DependencyFile {
  name: string;
  version: string;
  path: string;
  content: string; // base64
}

export interface DependenciesMessage {
  method: 'dependencies';
  scripts: DependencyFile[];
  stylesheets: DependencyFile[];
}

export interface RuntimeMessage {
  method: 'runtime';
  content: string; // base64
}

interface CustomMessage {
  method: 'custom';
  type: string;
  message: JSONValue;
}

export type HTMLWidgetMessage = 
  | InitMessage
  | DependenciesMessage
  | RuntimeMessage
  | CustomMessage;

const comms = new Map<string, Kernel.IComm>();

export function getComm(id: string): Kernel.IComm | undefined {
  return comms.get(id);
}

const closeHandlers = new Map<string, Set<() => void>>();

export function subscribeClose(
  commId: string,
  callback: () => void
): () => void {
  if (!comms.has(commId)) {
    throw new Error(`Comm not found: ${commId}`);
  }

  let handlers = closeHandlers.get(commId);

  if (!handlers) {
    handlers = new Set();
    closeHandlers.set(commId, handlers);
  }

  handlers.add(callback);

  return () => {
    handlers.delete(callback);

    if (handlers.size === 0) {
      closeHandlers.delete(commId);
    }
  };
}

const listeners = new Map<
  string,
  Set<(message: HTMLWidgetMessage) => void>
>();

export function subscribe(
  id: string,
  callback: (message: HTMLWidgetMessage) => void
): () => void {
  let callbacks = listeners.get(id);

  if (!callbacks) {
    callbacks = new Set();
    listeners.set(id, callbacks);
  }

  callbacks.add(callback);

  return () => {
    callbacks!.delete(callback);

    if (callbacks!.size === 0) {
      listeners.delete(id);
    }
  };
}

export function registerCommTarget(
  kernel: Kernel.IKernelConnection
): void {
  kernel.registerCommTarget(COMM_TARGET, (comm, msg) => {
    console.log('htmlwidget comm opened:', comm.commId);
    
    comms.set(comm.commId, comm);

    comm.onMsg = msg => {
      const data = msg.content.data as unknown as HTMLWidgetMessage;

      for (const callback of listeners.get(comm.commId) ?? []) {
        callback(data);
      }
    };

    comm.onClose = () => {
      const id = comm.commId;
      const handlers = closeHandlers.get(id);

      comms.delete(id);
      listeners.delete(id);
      closeHandlers.delete(id);

      for (const callback of [...(handlers ?? [])]) {
        callback();
      }

      console.log('htmlwidget comm closed:', comm.commId);
      
      comms.delete(comm.commId);
      listeners.delete(comm.commId);
    };
  });
}