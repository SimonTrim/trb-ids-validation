import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import type { ConnectProject, ViewerSelection } from '@/types';

declare global {
  interface Window {
    TrimbleConnectWorkspace: {
      connect: (target: Window | HTMLIFrameElement, onEvent: (event: string, data: unknown) => void, timeout?: number) => Promise<TrimbleAPI>;
    };
  }
}

export interface TrimbleAPI {
  project: {
    getCurrentProject: () => Promise<ConnectProject>;
  };
  user: {
    getUserSettings: () => Promise<{ language: string }>;
  };
  extension: {
    requestPermission: (permission: string) => Promise<string>;
    setStatusMessage: (msg: string) => void;
  };
  ui: {
    setMenu: (menu: unknown) => void;
    setActiveMenuItem: (cmd: string) => void;
  };
  viewer: {
    getModels: (filter?: string) => Promise<unknown[]>;
    getSelection: () => Promise<ViewerSelection[]>;
    setSelection: (selector: unknown, mode: string) => Promise<void>;
    getObjectProperties: (modelId: string, ids: number[]) => Promise<unknown[]>;
    getHierarchyChildren: (modelId: string, ids: number[], type: string, recursive: boolean) => Promise<unknown[]>;
    getHierarchyParents: (modelId: string, ids: number[], type: string, recursive: boolean) => Promise<unknown[]>;
    getLayers: (modelId: string) => Promise<unknown[]>;
    setObjectState: (selector: unknown, state: unknown) => Promise<void>;
    isolateEntities: (entities: unknown[]) => Promise<void>;
    convertToObjectIds: (modelId: string, ids: number[]) => Promise<string[]>;
    convertToObjectRuntimeIds: (modelId: string, ids: string[]) => Promise<number[]>;
    getSnapshot: () => Promise<string>;
  };
}

export interface TrimbleConnectState {
  isConnected: boolean;
  isEmbedded: boolean;
  project: ConnectProject | null;
  accessToken: string | null;
  selection: ViewerSelection[];
  api: TrimbleAPI | null;
}

// ── React Context ──

const TrimbleContext = createContext<TrimbleConnectState>({
  isConnected: false,
  isEmbedded: false,
  project: null,
  accessToken: null,
  selection: [],
  api: null,
});

export const TrimbleProvider = TrimbleContext.Provider;

export function useTrimbleContext(): TrimbleConnectState {
  return useContext(TrimbleContext);
}

// ── Hook ──

export function useTrimbleConnect() {
  const [state, setState] = useState<TrimbleConnectState>({
    isConnected: false,
    isEmbedded: false,
    project: null,
    accessToken: null,
    selection: [],
    api: null,
  });
  const apiRef = useRef<TrimbleAPI | null>(null);

  const handleEvent = useCallback((event: string, data: unknown) => {
    switch (event) {
      case 'extension.accessToken':
        setState((s) => ({ ...s, accessToken: data as string }));
        break;
      case 'viewer.selectionChanged':
        setState((s) => ({ ...s, selection: data as ViewerSelection[] }));
        break;
    }
  }, []);

  useEffect(() => {
    const isInIframe = window.self !== window.top;

    if (isInIframe && window.TrimbleConnectWorkspace) {
      window.TrimbleConnectWorkspace
        .connect(window.parent, handleEvent, 30000)
        .then(async (api) => {
          apiRef.current = api;
          const project = await api.project.getCurrentProject();
          const token = await api.extension.requestPermission('accesstoken');

          setState({
            isConnected: true,
            isEmbedded: true,
            project,
            accessToken: token !== 'pending' && token !== 'denied' ? token : null,
            selection: [],
            api,
          });
        })
        .catch((err) => {
          console.error('Failed to connect to Trimble Connect:', err);
          setState((s) => ({ ...s, isConnected: false }));
        });
    } else {
      // Dev mode: mock connection
      setState({
        isConnected: true,
        isEmbedded: false,
        project: { id: 'mock-project-id', name: 'Dev local', location: 'europe' },
        accessToken: 'mock-token',
        selection: [],
        api: null,
      });
    }
  }, [handleEvent]);

  return state;
}
