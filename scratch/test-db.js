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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('SUPABASE_URL:', supabaseUrl);
console.log('Has SERVICE_ROLE_KEY:', !!serviceKey);
console.log('Has ANON_KEY:', !!anonKey);

const supabaseAdmin = createClient(supabaseUrl, serviceKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

async function test() {
  console.log('\n--- 1. Testing with Service Role Key ---');
  const { data: dataAdmin, error: errAdmin } = await supabaseAdmin.from('connection_logs').select('*');
  console.log('Admin Select Error:', errAdmin);
  console.log('Admin Data count:', dataAdmin ? dataAdmin.length : 0);
  console.log('Admin Data sample:', dataAdmin);

  console.log('\n--- 2. Testing with Anon Key ---');
  const { data: dataAnon, error: errAnon } = await supabaseAnon.from('connection_logs').select('*');
  console.log('Anon Select Error:', errAnon);
  console.log('Anon Data count:', dataAnon ? dataAnon.length : 0);
}

test().catch(console.error);
