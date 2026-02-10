
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Session, Invite, View, AreaId, Interest, InviteStatus } from '../types';
import { STORAGE_KEY, INVITE_DURATION_MS } from '../constants';

const initialState: AppState = {
  currentSession: null,
  invites: [],
  currentView: 'WELCOME',
};

// Anonymous Relay API (No Auth Key-Value Store for Demos)
const RELAY_BASE = 'https://keyvalue.immanuel.co/api/KeyVal';
const APP_TOKEN = 'gb_v1_prod_relay'; // Unique token for this app instance

export function useGoldenBuddyStore() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure old data doesn't break new features
        return { ...initialState, ...parsed };
      } catch (e) {
        return initialState;
      }
    }
    return initialState;
  });

  const [remotePeers, setRemotePeers] = useState<Session[]>([]);
  const isSyncing = useRef(false);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // --- NETWORKING LOGIC ---

  // Update Session presence (Heartbeat)
  const broadcastPresence = useCallback(async () => {
    if (!state.currentSession || isSyncing.current) return;
    
    try {
      const sessionData = { 
        ...state.currentSession, 
        lastSeenAt: Date.now() 
      };
      // 1. Update personal session record
      await fetch(`${RELAY_BASE}/UpdateValue/${APP_TOKEN}/sess_${state.currentSession.id}/${encodeURIComponent(JSON.stringify(sessionData))}`, { method: 'POST' });
      
      // 2. Add ID to Area Directory (Simplified: we use the area as a key to hold a list of session IDs)
      // For a truly multi-user app, this would be a server-side append.
      // Here we simulate it by getting the list, adding ourselves, and posting back.
      const dirRes = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/dir_${state.currentSession.areaId}`);
      const dirRaw = await dirRes.text();
      let directory: string[] = [];
      try { directory = dirRaw ? JSON.parse(dirRaw) : []; } catch(e) {}
      
      if (!directory.includes(state.currentSession.id)) {
        directory.push(state.currentSession.id);
        await fetch(`${RELAY_BASE}/UpdateValue/${APP_TOKEN}/dir_${state.currentSession.areaId}/${encodeURIComponent(JSON.stringify(directory))}`, { method: 'POST' });
      }
    } catch (e) {
      console.error("Presence sync failed", e);
    }
  }, [state.currentSession]);

  // Poll for nearby buddies and incoming invites
  const syncRemoteData = useCallback(async () => {
    if (!state.currentSession || isSyncing.current) return;
    isSyncing.current = true;

    try {
      // 1. Fetch Area Directory
      const dirRes = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/dir_${state.currentSession.areaId}`);
      const dirRaw = await dirRes.text();
      let ids: string[] = [];
      try { ids = dirRaw ? JSON.parse(dirRaw) : []; } catch(e) {}

      // 2. Fetch data for each ID (concurrently)
      const peerPromises = ids
        .filter(id => id !== state.currentSession?.id)
        .map(async (id) => {
          const res = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/sess_${id}`);
          const raw = await res.text();
          try { return JSON.parse(raw) as Session; } catch(e) { return null; }
        });
      
      const peers = (await Promise.all(peerPromises)).filter(p => p && (Date.now() - p.lastSeenAt < 300000)) as Session[];
      setRemotePeers(peers);

      // 3. Check for incoming invites
      const invRes = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/inbox_${state.currentSession.id}`);
      const invRaw = await invRes.text();
      let remoteInvites: Invite[] = [];
      try { remoteInvites = invRaw ? JSON.parse(invRaw) : []; } catch(e) {}

      if (remoteInvites.length > 0) {
        setState(prev => {
          const existingIds = new Set(prev.invites.map(i => i.id));
          const newInvites = remoteInvites.filter(ri => !existingIds.has(ri.id));
          if (newInvites.length === 0) return prev;
          return { ...prev, invites: [...prev.invites, ...newInvites] };
        });
      }

      // 4. Update status of outgoing invites (did they accept?)
      const outgoing = state.invites.filter(i => i.fromSessionId === state.currentSession?.id && i.status === 'PENDING');
      for (const inv of outgoing) {
        const checkRes = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/inv_status_${inv.id}`);
        const statusRaw = await checkRes.text();
        if (statusRaw === 'ACCEPTED' || statusRaw === 'DECLINED') {
          setState(prev => ({
            ...prev,
            invites: prev.invites.map(i => i.id === inv.id ? { ...i, status: statusRaw as InviteStatus, respondedAt: Date.now() } : i)
          }));
        }
      }
    } catch (e) {
      console.warn("Sync failed", e);
    } finally {
      isSyncing.current = false;
    }
  }, [state.currentSession, state.invites]);

  // Set up intervals
  useEffect(() => {
    if (!state.currentSession) return;
    broadcastPresence();
    const presenceInt = setInterval(broadcastPresence, 15000);
    const syncInt = setInterval(syncRemoteData, 5000);
    return () => {
      clearInterval(presenceInt);
      clearInterval(syncInt);
    };
  }, [state.currentSession, broadcastPresence, syncRemoteData]);

  // Invite clean up (Local status)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setState(prev => {
        let changed = false;
        const newInvites = prev.invites.map(invite => {
          if (invite.status === 'PENDING' && now > invite.expiresAt) {
            changed = true;
            return { ...invite, status: 'EXPIRED' as InviteStatus };
          }
          return invite;
        });
        return changed ? { ...prev, invites: newInvites } : prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const setView = useCallback((view: View) => {
    setState(prev => ({ ...prev, currentView: view }));
  }, []);

  const createSession = useCallback((name: string, areaId: AreaId, interests: Interest[]) => {
    const newSession: Session = {
      id: `sess_${Math.random().toString(36).substr(2, 9)}`,
      displayName: name,
      areaId,
      interests,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    setState(prev => ({
      ...prev,
      currentSession: newSession,
      currentView: 'DASHBOARD'
    }));
  }, []);

  const sendInvite = useCallback(async (toId: string, activity: Interest) => {
    if (!state.currentSession) return;
    const newInvite: Invite = {
      id: `inv_${Math.random().toString(36).substr(2, 9)}`,
      fromSessionId: state.currentSession.id,
      toSessionId: toId,
      activity,
      status: 'PENDING',
      createdAt: Date.now(),
      expiresAt: Date.now() + INVITE_DURATION_MS,
    };

    // Store locally
    setState(prev => ({
      ...prev,
      invites: [...prev.invites, newInvite],
      currentView: 'DASHBOARD'
    }));

    // Send to remote inbox
    try {
      const inboxRes = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/inbox_${toId}`);
      const inboxRaw = await inboxRes.text();
      let inbox: Invite[] = [];
      try { inbox = inboxRaw ? JSON.parse(inboxRaw) : []; } catch(e) {}
      inbox.push(newInvite);
      await fetch(`${RELAY_BASE}/UpdateValue/${APP_TOKEN}/inbox_${toId}/${encodeURIComponent(JSON.stringify(inbox))}`, { method: 'POST' });
    } catch (e) {
      console.error("Failed to send invite remotely", e);
    }
  }, [state.currentSession]);

  const respondToInvite = useCallback(async (inviteId: string, action: 'ACCEPTED' | 'DECLINED') => {
    setState(prev => ({
      ...prev,
      invites: prev.invites.map(inv => 
        inv.id === inviteId ? { ...inv, status: action, respondedAt: Date.now() } : inv
      )
    }));

    // Update remote status for the sender to see
    try {
      await fetch(`${RELAY_BASE}/UpdateValue/${APP_TOKEN}/inv_status_${inviteId}/${action}`, { method: 'POST' });
      // Remove from inbox
      if (state.currentSession) {
        const inboxRes = await fetch(`${RELAY_BASE}/GetValue/${APP_TOKEN}/inbox_${state.currentSession.id}`);
        const inboxRaw = await inboxRes.text();
        let inbox: Invite[] = [];
        try { inbox = inboxRaw ? JSON.parse(inboxRaw) : []; } catch(e) {}
        const filtered = inbox.filter(i => i.id !== inviteId);
        await fetch(`${RELAY_BASE}/UpdateValue/${APP_TOKEN}/inbox_${state.currentSession.id}/${encodeURIComponent(JSON.stringify(filtered))}`, { method: 'POST' });
      }
    } catch (e) {}
  }, [state.currentSession]);

  const resetApp = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(initialState);
  }, []);

  return {
    state,
    remotePeers,
    setView,
    createSession,
    sendInvite,
    respondToInvite,
    resetApp
  };
}
