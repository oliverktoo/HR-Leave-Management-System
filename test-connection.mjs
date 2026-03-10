// Test Supabase Remote Connection
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmvdagfduojwbsxgqkjw.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tdmRhZ2ZkdW9qd2JzeGdxa2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNzUxNzMsImV4cCI6MjA3ODc1MTE3M30.kfHFaNYGzSEVl7TgTdIj43Iw67hUZu7LwESX77vxJWA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    console.log(`  Found ${leaveTypes.length} leave types:`, leaveTypes.map(t => `${t.name} (${t.max_days_per_year} days)`).join(', '));

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
    console.log(`  Found ${holidays.length} holidays:`, holidays.map(h => `${h.name} (${h.date})`).join(', '));

    // Test 4: Check users_profile table
    console.log('\n✓ Testing users_profile table...');
    const { data: users, error: userError } = await supabase
      .from('users_profile')
      .select('email, role, is_active')
      .limit(5);
    
    if (userError) {
      console.error('❌ Users profile error:', userError.message);
      console.log('  Note: This might be due to RLS policies (users need to be authenticated)');
    } else {
      console.log(`  Found ${users.length} users`);
    }

    // Test 5: Check all tables exist
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

    console.log('\n🎉 Connection test complete!');
    return true;

  } catch (error) {
    console.error('\n❌ Connection test failed:', error);
    return false;
  }
}

testConnection();
