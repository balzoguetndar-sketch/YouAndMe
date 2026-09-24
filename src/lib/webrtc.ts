import { createClient } from '@/src/lib/supabase/clients';

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
  const channel = supabase.channel(`webrtc_${cleanEmail}`);

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
  const channel = supabase.channel(`webrtc_${cleanTarget}`);

  await channel.subscribe();
  await channel.send({
    type: 'broadcast',
    event: 'signal',
    payload: signal,
  });
}

/**
 * Suivi de présence en temps réel (En ligne / Hors ligne)
 */
export function subscribeToPresence(
  myEmail: string,
  onPresenceUpdate: (onlineUsers: Set<string>) => void
) {
  const cleanMyEmail = myEmail.toLowerCase().trim();
  const supabase = createClient();
  const channel = supabase.channel('yam_presence_room', {
    config: {
      presence: {
        key: cleanMyEmail,
      },
    },
  });

  const updateState = () => {
    const state = channel.presenceState();
    const onlineSet = new Set<string>();
    Object.keys(state).forEach((key) => {
      onlineSet.add(key.toLowerCase().trim());
    });
    onPresenceUpdate(onlineSet);
  };

  channel
    .on('presence', { event: 'sync' }, updateState)
    .on('presence', { event: 'join' }, updateState)
    .on('presence', { event: 'leave' }, updateState)
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && cleanMyEmail) {
        await channel.track({
          email: cleanMyEmail,
          onlineAt: new Date().toISOString(),
        });
      }
    });

  return () => {
    channel.untrack().catch(() => { });
    supabase.removeChannel(channel);
  };
}