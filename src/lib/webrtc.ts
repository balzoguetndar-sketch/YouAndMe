import { createClient } from '@/src/lib/supabase/clients';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type SignalType =
  | 'call-request'
  | 'call-accepted'
  | 'call-rejected'
  | 'call-ended'
  | 'offer'
  | 'answer'
  | 'ice-candidate';

export type SignalData = {
  type: SignalType;
  sender: string;
  target: string;
  payload?: any;
  ambience?: string;
  callType?: 'audio' | 'video';
};

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
  ],
};

/**
 * Abonnement aux signaux WebRTC pour un utilisateur donné
 */
export function subscribeToSignals(
  userEmail: string,
  onSignalReceived: (data: SignalData) => void
) {
  const cleanEmail = userEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const supabase = createClient();
  const channelName = `webrtc_${cleanEmail}`;

  // Nettoie un ancien canal s'il existait déjà pour éviter les doublons de souscription
  const existingChannels = supabase.getChannels();
  const found = existingChannels.find((ch) => ch.topic === `realtime:${channelName}`);
  if (found) {
    supabase.removeChannel(found);
  }

  const channel = supabase.channel(channelName);

  channel
    .on('broadcast', { event: 'signal' }, (payload) => {
      if (payload.payload) {
        onSignalReceived(payload.payload as SignalData);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Envoi d'un signal WebRTC à un utilisateur cible
 */
export async function sendSignal(targetEmail: string, signal: SignalData) {
  const cleanTarget = targetEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const supabase = createClient();
  const channelName = `webrtc_${cleanTarget}`;

  const channel = supabase.channel(channelName);

  await channel.subscribe();
  await channel.send({
    type: 'broadcast',
    event: 'signal',
    payload: signal,
  });
}

// Gestionnaire Singleton de présence pour partager la même connexion WebSocket entre plusieurs composants
let sharedPresenceChannel: RealtimeChannel | null = null;
const presenceListeners = new Set<(onlineUsers: Set<string>) => void>();
let trackedUserEmail: string | null = null;

/**
 * Suivi de présence en temps réel (En ligne / Hors ligne)
 */
export function subscribeToPresence(
  myEmail: string,
  onPresenceUpdate: (onlineUsers: Set<string>) => void
) {
  const cleanMyEmail = myEmail.toLowerCase().trim();
  const supabase = createClient();

  presenceListeners.add(onPresenceUpdate);

  const notifyAll = (state: Record<string, any[]>) => {
    const onlineSet = new Set<string>();
    Object.keys(state).forEach((key) => {
      onlineSet.add(key.toLowerCase().trim());
    });
    presenceListeners.forEach((listener) => {
      try {
        listener(onlineSet);
      } catch (err) {
        console.warn('Erreur listener présence :', err);
      }
    });
  };

  // Si le canal n'est pas encore créé, on l'initialise
  if (!sharedPresenceChannel) {
    trackedUserEmail = cleanMyEmail;

    // Supprime un canal orphelin préexistant s'il y en a un dans l'instance
    const existingChannels = supabase.getChannels();
    const existing = existingChannels.find((ch) => ch.topic === 'realtime:yam_presence_room');
    if (existing) {
      supabase.removeChannel(existing);
    }

    sharedPresenceChannel = supabase.channel('yam_presence_room', {
      config: {
        presence: {
          key: cleanMyEmail,
        },
      },
    });

    const updateState = () => {
      if (sharedPresenceChannel) {
        const state = sharedPresenceChannel.presenceState();
        notifyAll(state);
      }
    };

    sharedPresenceChannel
      .on('presence', { event: 'sync' }, updateState)
      .on('presence', { event: 'join' }, updateState)
      .on('presence', { event: 'leave' }, updateState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && cleanMyEmail && sharedPresenceChannel) {
          try {
            await sharedPresenceChannel.track({
              email: cleanMyEmail,
              onlineAt: new Date().toISOString(),
            });
          } catch (trackErr) {
            console.warn('Track presence ignoré :', trackErr);
          }
        }
      });
  } else {
    // Si le canal est déjà souscrit, on transmet immédiatement l'état actuel au nouveau composant
    try {
      const currentState = sharedPresenceChannel.presenceState();
      if (currentState && Object.keys(currentState).length > 0) {
        const onlineSet = new Set<string>();
        Object.keys(currentState).forEach((key) => {
          onlineSet.add(key.toLowerCase().trim());
        });
        onPresenceUpdate(onlineSet);
      }
    } catch {}
  }

  return () => {
    presenceListeners.delete(onPresenceUpdate);
    // On ne ferme le canal que si aucun composant n'écoute plus la présence
    if (presenceListeners.size === 0 && sharedPresenceChannel) {
      try {
        sharedPresenceChannel.untrack().catch(() => {});
        supabase.removeChannel(sharedPresenceChannel);
      } catch {}
      sharedPresenceChannel = null;
      trackedUserEmail = null;
    }
  };
}