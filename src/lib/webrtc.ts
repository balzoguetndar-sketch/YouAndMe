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
  payload?: unknown;
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
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Support des serveurs TURN configurables via variables d'environnement
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [
          {
            urls: process.env.NEXT_PUBLIC_TURN_URL,
            username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
          },
        ]
      : []),
  ],
  iceCandidatePoolSize: 10,
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

  const channel = supabase.channel(channelName, {
    config: {
      broadcast: { self: true },
    },
  });

  channel
    .on('broadcast', { event: 'signal' }, (payload) => {
      if (payload && payload.payload) {
        onSignalReceived(payload.payload as SignalData);
      }
    })
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {}
  };
}

/**
 * Envoi d'un signal WebRTC à un utilisateur cible (garantit que le canal est connecté avant l'envoi)
 */
export async function sendSignal(targetEmail: string, signal: SignalData): Promise<boolean> {
  const cleanTarget = targetEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const supabase = createClient();
  const channelName = `webrtc_${cleanTarget}`;

  return new Promise<boolean>((resolve) => {
    let finished = false;
    const existingChannels = supabase.getChannels();
    let channel = existingChannels.find((ch) => ch.topic === `realtime:${channelName}`);

    const transmit = async (ch: RealtimeChannel) => {
      if (finished) return;
      try {
        await ch.send({
          type: 'broadcast',
          event: 'signal',
          payload: signal,
        });
        finished = true;
        resolve(true);
      } catch (err) {
        console.warn('Erreur transmission signal WebRTC :', err);
        finished = true;
        resolve(false);
      }
    };

    if (channel && channel.state === 'joined') {
      transmit(channel);
      return;
    }

    if (!channel) {
      channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: true },
        },
      });
    }

    const fallbackTimeout = setTimeout(() => {
      if (!finished && channel) {
        transmit(channel);
      }
    }, 1200);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && channel) {
        clearTimeout(fallbackTimeout);
        transmit(channel);
      }
    });
  });
}

// Gestionnaire Singleton de présence pour partager la même connexion WebSocket entre plusieurs composants
let sharedPresenceChannel: RealtimeChannel | null = null;
const presenceListeners = new Set<(onlineUsers: Set<string>) => void>();

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

  const notifyAll = (state: Record<string, unknown[]>) => {
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
    }
  };
}