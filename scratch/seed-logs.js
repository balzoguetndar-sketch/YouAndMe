const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) {
    let val = rest.join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[key.trim()] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

async function seedCurrentLogs() {
  const now = new Date();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const logsToInsert = [
    {
      email: 'balzoguetndar@gmail.com',
      ip_address: '127.0.0.1 (Session Admin)',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      started_at: now.toISOString(),
      ended_at: now.toISOString(),
      created_at: now.toISOString(),
      location: 'Local'
    },
    {
      email: 'adiiopase@gmail.com',
      ip_address: '192.168.43.9 (Client Test)',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      started_at: fiveMinAgo.toISOString(),
      ended_at: fiveMinAgo.toISOString(),
      created_at: fiveMinAgo.toISOString(),
      location: 'En ligne'
    }
  ];

  const { data, error } = await supabaseAdmin.from('connection_logs').insert(logsToInsert).select();
  console.log('Seed results:', { data, error });

  const { data: allLogs } = await supabaseAdmin.from('connection_logs').select('*').order('created_at', { ascending: false });
  console.log('Total logs in Supabase now:', allLogs?.length);
  console.log('Logs in DB:', allLogs);
}

seedCurrentLogs().catch(console.error);
