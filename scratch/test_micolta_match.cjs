const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://cmzeijcyykzdmvisojte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemVpamN5eWt6ZG12aXNvanRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzc5MTYsImV4cCI6MjA5MzY1MzkxNn0.qn5_sVmmZ1gb6YQCaO2RQYWRO-XwVTuLTY64LK8mAME';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: dOfficial } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', 'bdc23fec-f35b-48c1-bbe2-5f6e214d3537')
    .single();

  const { data: dDup } = await supabase
    .from('conductores')
    .select('*')
    .eq('id', '1f887928-0a1b-4c4c-b54d-8159ceab495a')
    .single();

  console.log("Official name:", JSON.stringify(dOfficial.nombres));
  console.log("Official contract:", dOfficial.contrato_id);
  console.log("Official estado:", dOfficial.estado);
  console.log("Dup name:", JSON.stringify(dDup.nombres));
  console.log("Dup contract:", dDup.contrato_id);
  console.log("Dup estado:", dDup.estado);

  const normName = (name) =>
    String(name ?? '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  console.log("Official normalized:", normName(dOfficial.nombres));
  console.log("Dup normalized:", normName(dDup.nombres));
  console.log("Equal?", normName(dOfficial.nombres) === normName(dDup.nombres));
}

run();
