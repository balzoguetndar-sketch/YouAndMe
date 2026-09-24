import { createClient } from '@/src/lib/supabase/clients';

export async function logUserConnection(email: string) {
  const supabase = createClient();

  try {
    let publicIp = 'Direct';
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(1500),
      });
      if (ipResponse.ok) {
        const ipData = await ipResponse.json();
        if (ipData.ip) publicIp = ipData.ip;
      }
    } catch {
      // Ignoré si réseau restreint ou bloqué
    }

    const { error } = await supabase.from('connection_logs').insert([
      {
        email,
        ip_address: publicIp,
        connected_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.warn('Erreur de journalisation :', error.message);
    }
  } catch (err) {
    console.warn('Journalisation ignorée :', err);
  }
}