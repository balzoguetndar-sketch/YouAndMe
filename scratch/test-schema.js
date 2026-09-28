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

async function inspectAndTest() {
  const now = new Date().toISOString();
  const testObj = {
    email: 'balzoguetndar@gmail.com',
    ip_address: '127.0.0.1',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    started_at: now,
    ended_at: now,
    created_at: now
  };

  const { data, error } = await supabaseAdmin.from('connection_logs').insert([testObj]).select();
  console.log('Insert with ended_at:', { data, error });

  const { data: allLogs, error: selErr } = await supabaseAdmin.from('connection_logs').select('*');
  console.log('Select error:', selErr);
  console.log('Total logs in Supabase now:', allLogs?.length);
  if (allLogs && allLogs.length > 0) {
    console.log('Sample log row:', allLogs[0]);
  }
}

inspectAndTest().catch(console.error);
