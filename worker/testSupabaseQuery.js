import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum di-set di env!');
  process.exit(1);
}

console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) + '...');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testQuery(phoneNumber) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone_number', phoneNumber);

  if (error) {
    console.error('Query error:', error);
  } else if (!data || data.length === 0) {
    console.log('User TIDAK ditemukan.');
  } else {
    console.log('User ditemukan:', data[0]);
  }
}

const phoneNumber = process.argv[2] || '6281519624321';
testQuery(phoneNumber);
