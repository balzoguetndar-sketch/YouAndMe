import { createHmac } from 'node:crypto';

const MASKED_IP = 'Masqué';

export function getPrivacySafeIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwardedIp = forwardedFor?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const clientIp = forwardedIp || realIp;

  if (!clientIp || !process.env.IP_MASKING_SECRET) {
    return MASKED_IP;
  }

  const signingKey = process.env.IP_MASKING_SECRET;
  return createHmac('sha256', signingKey).update(clientIp).digest('hex');
}

export function getMaskedIpLabel(): string {
  return MASKED_IP;
}
