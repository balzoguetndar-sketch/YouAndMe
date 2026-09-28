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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const clientReceiver = createClient(supabaseUrl, anonKey);
const clientSender = createClient(supabaseUrl, anonKey);

const targetEmail = 'adiopa.ad@gmail.com';
const cleanTarget = targetEmail.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_');
const channelName = `webrtc_${cleanTarget}`;

console.log('Testing channel name:', channelName);

let received = false;

// 1. Receiver subscribes
const receiverChannel = clientReceiver.channel(channelName);
receiverChannel
  .on('broadcast', { event: 'signal' }, (payload) => {
    console.log('🎉 RECEIVER RECEIVED SIGNAL:', payload);
    received = true;
    process.exit(0);
  })
  .subscribe((status) => {
    console.log('Receiver status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('Receiver is subscribed. Now sender will send...');
      // 2. Sender sends
      sendTest();
    }
  });

function sendTest() {
  const senderChannel = clientSender.channel(channelName);
  senderChannel.subscribe((status) => {
    console.log('Sender status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('Sender subscribed, sending message...');
      senderChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'call-request',
          sender: 'balzoguetndar@gmail.com',
          target: targetEmail,
          callType: 'video',
          ambience: 'neutral'
        }
      }).then((res) => {
        console.log('Sender send result:', res);
      }).catch(console.error);
    }
  });
}

setTimeout(() => {
  if (!received) {
    console.error('❌ TIMEOUT: Signal was NOT received by receiver after 10s!');
    process.exit(1);
  }
}, 10000);
