export const CALL_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: { ideal: 48000 },
  channelCount: { ideal: 1 },
};

export const CALL_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280, min: 320 },
  height: { ideal: 720, min: 240 },
  frameRate: { ideal: 30 },
};

export async function configureCallSenderQuality(
  sender: RTCRtpSender,
  kind: 'audio' | 'video',
): Promise<void> {
  try {
    const parameters = sender.getParameters();
    const encoding = parameters.encodings[0];
    if (!encoding) return;

    encoding.maxBitrate = kind === 'video' ? 2_500_000 : 96_000;
    if (kind === 'video') {
      encoding.maxFramerate = 30;
      parameters.degradationPreference = 'balanced';
    }

    await sender.setParameters(parameters);
  } catch (error) {
    console.warn(
      `Réglage qualité ${kind} non pris en charge ; le navigateur conserve son adaptation par défaut.`,
      error,
    );
  }
}
