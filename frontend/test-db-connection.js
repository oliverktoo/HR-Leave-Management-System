import { supabase } from './lib/supabaseClient.js';

console.log('🔌 Testing Supabase connection...\n');

async function testConnection() {
  try {
    // Test 1: Check departments table
    console.log('✓ Testing departments table...');
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .limit(5);
    
    if (deptError) {
      console.error('❌ Departments error:', deptError.message);
      return false;
    }
    console.log(`  Found ${departments.length} departments:`, departments.map(d => d.name).join(', '));

    // Test 2: Check leave_types table
    console.log('\n✓ Testing leave_types table...');
    const { data: leaveTypes, error: typeError } = await supabase
      .from('leave_types')
      .select('id, name, max_days_per_year')
      .eq('is_active', true);
    
    if (typeError) {
      console.error('❌ Leave types error:', typeError.message);
      return false;
    }
    console.log(`  Found ${leaveTypes.length} leave types:`);
    leaveTypes.forEach(t => console.log(`    - ${t.name} (${t.max_days_per_year} days)`));

    // Test 3: Check public_holidays table
    console.log('\n✓ Testing public_holidays table...');
    const { data: holidays, error: holidayError } = await supabase
      .from('public_holidays')
      .select('date, name')
      .order('date')
      .limit(5);
    
    if (holidayError) {
      console.error('❌ Public holidays error:', holidayError.message);
      return false;
    }
    console.log(`  Found ${holidays.length} holidays:`);
    holidays.forEach(h => console.log(`    - ${h.name} (${h.date})`));

    // Test 4: Check all tables exist
    console.log('\n✓ Checking all core tables...');
    const tables = [
      'departments', 
      'leave_types', 
      'users_profile', 
      'leave_balances', 
      'leave_requests', 
      'leave_request_history', 
      'public_holidays', 
      'notifications', 
      'audit_logs'
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error) {
        console.log(`  ❌ ${table} - ERROR: ${error.message}`);
      } else {
        console.log(`  ✅ ${table}`);
      }
    }

    console.log('\n🎉 Connection test complete! Database is ready.');
    return true;

  } catch (error) {
    console.error('\n❌ Connection test failed:', error);
    return false;
  }
}

testConnection();
