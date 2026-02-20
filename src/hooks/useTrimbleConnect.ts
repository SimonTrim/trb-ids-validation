import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import type { ConnectProject, ViewerSelection } from '@/types';

declare global {
  interface Window {
    TrimbleConnectWorkspace: {
      connect: (target: Window | HTMLIFrameElement, onEvent: (event: string, data: unknown) => void, timeout?: number) => Promise<TrimbleAPI>;
    };
    WorkspaceAPI: {
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
    getSelection: () => Promise<unknown>;
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

// ── Normalize selection data from various TC formats ──

function normalizeSelection(data: unknown): ViewerSelection[] {
  if (!data) return [];

  // Already an array
  if (Array.isArray(data)) {
    // Format: [{ modelId, objectRuntimeIds }]
    if (data.length > 0 && data[0]?.modelId && data[0]?.objectRuntimeIds) {
      return data as ViewerSelection[];
    }
    // Format: [{ modelObjectIds: [{ modelId, objectRuntimeIds }] }]
    if (data.length > 0 && data[0]?.modelObjectIds) {
      return (data as Array<{ modelObjectIds: ViewerSelection[] }>)
        .flatMap(d => d.modelObjectIds);
    }
    return [];
  }

  // Single object: { modelId, objectRuntimeIds }
  const obj = data as Record<string, unknown>;
  if (obj.modelId && obj.objectRuntimeIds) {
    return [{ modelId: obj.modelId as string, objectRuntimeIds: obj.objectRuntimeIds as number[] }];
  }

  // Wrapper: { modelObjectIds: [...] }
  if (obj.modelObjectIds && Array.isArray(obj.modelObjectIds)) {
    return obj.modelObjectIds as ViewerSelection[];
  }

  console.warn('[TC] Unknown selection format:', data);
  return [];
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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleEvent = useCallback((event: string, data: unknown) => {
    console.log('[TC Event]', event, data);

    switch (event) {
      case 'extension.accessToken':
        setState((s) => ({ ...s, accessToken: data as string }));
        break;
      case 'viewer.selectionChanged': {
        const selection = normalizeSelection(data);
        setState((s) => ({ ...s, selection }));
        break;
      }
    }
  }, []);

  // Fallback: poll getSelection() every 2s when embedded
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !state.isEmbedded) return;

    pollingRef.current = setInterval(async () => {
      try {
        const raw = await api.viewer.getSelection();
        const selection = normalizeSelection(raw);
        setState((s) => {
          const prevIds = JSON.stringify(s.selection);
          const newIds = JSON.stringify(selection);
          if (prevIds === newIds) return s;
          return { ...s, selection };
        });
      } catch {
        // Viewer might not be ready yet
      }
    }, 2000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [state.isEmbedded]);

  useEffect(() => {
    const isInIframe = window.self !== window.top;
    const sdk = window.TrimbleConnectWorkspace ?? window.WorkspaceAPI;

    if (isInIframe && sdk) {
      console.log('[TC] Connecting to Workspace API...');
      sdk
        .connect(window.parent, handleEvent, 30000)
        .then(async (api) => {
          console.log('[TC] Connected successfully');
          apiRef.current = api;

          let project: ConnectProject | null = null;
          try {
            project = await api.project.getCurrentProject();
            console.log('[TC] Project:', project);
          } catch (e) {
            console.warn('[TC] Could not get project:', e);
          }

          let accessToken: string | null = null;
          try {
            const token = await api.extension.requestPermission('accesstoken');
            if (token !== 'pending' && token !== 'denied') {
              accessToken = token;
            }
            console.log('[TC] Token status:', token === accessToken ? 'obtained' : token);
          } catch (e) {
            console.warn('[TC] Could not get token:', e);
          }

          // Fetch initial selection
          let initialSelection: ViewerSelection[] = [];
          try {
            const raw = await api.viewer.getSelection();
            initialSelection = normalizeSelection(raw);
            console.log('[TC] Initial selection:', initialSelection);
          } catch (e) {
            console.warn('[TC] Could not get initial selection:', e);
          }

          setState({
            isConnected: true,
            isEmbedded: true,
            project,
            accessToken,
            selection: initialSelection,
            api,
          });
        })
        .catch((err) => {
          console.error('[TC] Failed to connect:', err);
          setState((s) => ({ ...s, isConnected: false }));
        });
    } else {
      console.log('[TC] Dev mode (not in iframe or no SDK)');
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
