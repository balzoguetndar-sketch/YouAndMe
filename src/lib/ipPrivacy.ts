export function getPrivacySafeIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const forwardedIp = forwardedFor?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const cfConnectingIp = request.headers.get('cf-connecting-ip')?.trim();
  let clientIp = forwardedIp || realIp || cfConnectingIp || '127.0.0.1';

  if (clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
    clientIp = '127.0.0.1';
  }

  return clientIp;
}

export function formatIpDisplay(ip: string | null | undefined): string {
  if (!ip || ip === 'Masqué') return 'Non renseignée';
  if (ip === '127.0.0.1' || ip === 'localhost') return '127.0.0.1 (Local)';
  return ip;
}

export function getMaskedIpLabel(): string {
  return 'Non renseignée';
}
