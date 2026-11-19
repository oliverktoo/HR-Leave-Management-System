import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';

interface DirectoryEmployee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string;
  role: string;
  is_active: boolean | null;
  department_id: string | null;
  departmentName?: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', hr_admin: 'HR Admin', hod: 'HOD',
  fleet_manager: 'Fleet Manager', driver: 'Driver', employee: 'Employee',
  finance: 'Finance', ceo: 'CEO',
};

export function EmployeeDirectory() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [empRes, deptRes] = await Promise.all([
        supabase
          .from('users_profile')
          .select('id, first_name, last_name, email, employee_id, role, is_active, department_id')
          .order('first_name'),
        supabase.from('departments').select('id, name').order('name'),
      ]);

      const depts: { id: string; name: string }[] = deptRes.data ?? [];
      setDepartments(depts);

      const deptMap = new Map(depts.map(d => [d.id, d.name]));
      const enriched = (empRes.data ?? []).map(e => ({
        ...e,
        departmentName: e.department_id ? (deptMap.get(e.department_id) ?? 'Unknown') : 'No Department',
      }));
      setEmployees(enriched);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = employees.filter(e => {
    const matchSearch = !search ||
      `${e.first_name} ${e.last_name} ${e.email} ${e.employee_id ?? ''}`.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === 'all' || e.departmentName === filterDept;
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' ? e.is_active !== false : e.is_active === false);
    return matchSearch && matchDept && matchStatus;
  });

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>🧑‍💼 Employee Profiles</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Select an employee to view their full record</p>
          </div>
          <NotificationBell />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ maxWidth: 280, margin: 0 }}
            placeholder="Search name, email, ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="form-input" style={{ maxWidth: 200, margin: 0 }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <select className="form-input" style={{ maxWidth: 160, margin: 0 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Staff</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            {loading ? 'Loading…' : `${filtered.length} employee${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            <p>Loading employees…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
            <p style={{ margin: 0 }}>No employees match your filters.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
            {filtered.map(e => {
              const initials = `${e.first_name?.[0] ?? ''}${e.last_name?.[0] ?? ''}`.toUpperCase();
              const isActive = e.is_active !== false;
              return (
                <div
                  key={e.id}
                  onClick={() => navigate(`/admin/employees/${e.id}`)}
                  style={{
                    background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px',
                    padding: '1.25rem', cursor: 'pointer', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '1rem',
                  }}
                  onMouseEnter={ev => { ev.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.15)'; ev.currentTarget.style.borderColor = '#a5b4fc'; }}
                  onMouseLeave={ev => { ev.currentTarget.style.boxShadow = 'none'; ev.currentTarget.style.borderColor = '#e2e8f0'; }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1rem', fontWeight: 700, color: isActive ? 'white' : '#94a3b8',
                  }}>
                    {initials || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.first_name} {e.last_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {e.departmentName} · {ROLE_LABELS[e.role] ?? e.role}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                      {e.employee_id || e.email}
                    </div>
                  </div>
                  {!isActive && (
                    <span style={{ fontSize: '0.68rem', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 9999, flexShrink: 0 }}>
                      Inactive
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
