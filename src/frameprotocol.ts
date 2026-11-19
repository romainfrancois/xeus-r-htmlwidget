import type { JSONValue } from '@lumino/coreutils';
import type { Dependency } from './comms';

export type FrameInit = {
  kind: 'init';
  runtime: string;
  dependencies: Dependency[];
  markup: string;
};

export type RendererMessage =
  FrameInit | { kind: 'custom'; type: string; message: JSONValue };

export type FrameMessage =
  | { kind: 'ready'; id: string }
  | { kind: 'input'; name: string; value: string }
  | { kind: 'resize'; height: number }
  | { kind: 'error'; message: string };
