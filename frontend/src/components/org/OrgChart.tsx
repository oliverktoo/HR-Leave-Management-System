import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  role: string;
  department_id: string | null;
}

interface DeptNode {
  id: string;
  name: string;
  description: string | null;
  hod: Employee | null;
  members: Employee[];
  headcount: number;
}

interface RawDepartment {
  id: string;
  name: string;
  description: string | null;
  head_of_department_id: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BORDER_COLORS = [
  '#6366f1',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0284c7',
  '#65a30d',
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  hod: 'Head of Department',
  fleet_manager: 'Fleet Manager',
  driver: 'Driver',
  employee: 'Employee',
};

const ROLE_ORDER = ['super_admin', 'hr_admin', 'hod', 'fleet_manager', 'driver', 'employee'];

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function fullName(e: Employee): string {
  return `${e.first_name} ${e.last_name}`.trim();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DeptCardProps {
  node: DeptNode;
  colorIndex: number;
  dimmed: boolean;
}

function DeptCard({ node, colorIndex, dimmed }: DeptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = BORDER_COLORS[colorIndex % BORDER_COLORS.length];

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 10,
    border: '1px solid var(--gray-200)',
    borderLeft: `4px solid ${borderColor}`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    opacity: dimmed ? 0.35 : 1,
    transition: 'opacity 0.2s ease, box-shadow 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={cardStyle}>
      {/* Card Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--gray-100)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--gray-900)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            lineHeight: 1.3,
            flex: 1,
          }}>
            {node.name}
          </h3>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'var(--gray-100)',
            color: 'var(--gray-700)',
            borderRadius: 20,
            padding: '2px 9px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {node.headcount} <span style={{ fontSize: 13 }}>👥</span>
          </span>
        </div>
        {node.description && (
          <p style={{
            margin: '5px 0 0',
            fontSize: 12,
            color: 'var(--gray-500)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {node.description}
          </p>
        )}
      </div>

      {/* HOD Row */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
        {node.hod ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: borderColor,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {node.hod.first_name[0]}{node.hod.last_name[0]}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-900)' }}>
                {fullName(node.hod)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Head of Department</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
            No HOD assigned
          </div>
        )}
      </div>

      {/* Members Toggle */}
      {node.members.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(prev => !prev)}
            style={{
              width: '100%',
              padding: '9px 16px',
              background: 'none',
              border: 'none',
              borderBottom: expanded ? '1px solid var(--gray-100)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--gray-600)',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <span style={{
              display: 'inline-block',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              fontSize: 10,
            }}>
              ▼
            </span>
            {expanded ? 'Hide' : `Show ${node.members.length} member${node.members.length !== 1 ? 's' : ''}`}
          </button>

          {expanded && (
            <ul style={{ margin: 0, padding: '8px 16px 12px', listStyle: 'none' }}>
              {node.members.map(m => (
                <li key={m.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  fontSize: 12,
                  borderBottom: '1px solid var(--gray-100)',
                  gap: 8,
                }}>
                  <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>
                    {fullName(m)}
                    <span style={{ color: 'var(--gray-400)', marginLeft: 5, fontWeight: 400 }}>
                      {m.employee_id}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: 'var(--gray-500)',
                    background: 'var(--gray-100)',
                    padding: '1px 6px',
                    borderRadius: 10,
                    whiteSpace: 'nowrap',
                  }}>
                    {roleLabel(m.role)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {node.members.length === 0 && (
        <div style={{ padding: '8px 16px 12px', fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
          No other members
        </div>
      )}
    </div>
  );
}

interface RoleGroupCardProps {
  role: string;
  employees: Employee[];
  colorIndex: number;
  dimmed: boolean;
}

function RoleGroupCard({ role, employees, colorIndex, dimmed }: RoleGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = BORDER_COLORS[colorIndex % BORDER_COLORS.length];

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid var(--gray-200)',
      borderLeft: `4px solid ${borderColor}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      overflow: 'hidden',
      opacity: dimmed ? 0.35 : 1,
      transition: 'opacity 0.2s ease',
    }}>
      <div style={{
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: expanded ? '1px solid var(--gray-100)' : 'none',
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--gray-900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {roleLabel(role)}
        </h3>
        <span style={{
          background: 'var(--gray-100)',
          color: 'var(--gray-700)',
          borderRadius: 20,
          padding: '2px 9px',
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {employees.length} <span style={{ fontSize: 13 }}>👥</span>
        </span>
      </div>

      <button
        onClick={() => setExpanded(prev => !prev)}
        style={{
          width: '100%',
          padding: '9px 16px',
          background: 'none',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--gray-100)' : 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--gray-600)',
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          fontSize: 10,
        }}>
          ▼
        </span>
        {expanded ? 'Hide members' : `Show ${employees.length} member${employees.length !== 1 ? 's' : ''}`}
      </button>

      {expanded && (
        <ul style={{ margin: 0, padding: '8px 16px 12px', listStyle: 'none' }}>
          {employees.map(e => (
            <li key={e.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 0',
              fontSize: 12,
              borderBottom: '1px solid var(--gray-100)',
              gap: 8,
            }}>
              <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>
                {fullName(e)}
                <span style={{ color: 'var(--gray-400)', marginLeft: 5, fontWeight: 400 }}>
                  {e.employee_id}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrgChart() {
  const { profile: _profile } = useAuth();

  const [departments, setDepartments] = useState<RawDepartment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'department' | 'role'>('department');

  // ── Fetch data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const [deptResult, empResult] = await Promise.all([
        supabase
          .from('departments')
          .select('id, name, description, head_of_department_id')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('users_profile')
          .select('id, first_name, last_name, employee_id, role, department_id')
          .eq('is_active', true)
          .order('last_name'),
      ]);

      if (cancelled) return;

      if (deptResult.error) {
        setError(deptResult.error.message);
        setLoading(false);
        return;
      }
      if (empResult.error) {
        setError(empResult.error.message);
        setLoading(false);
        return;
      }

      setDepartments((deptResult.data ?? []) as RawDepartment[]);
      setEmployees((empResult.data ?? []) as Employee[]);
      setLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // ── Build dept nodes ────────────────────────────────────────────────────────
  const deptNodes = useMemo((): DeptNode[] => {
    return departments.map(dept => {
      const hod = dept.head_of_department_id
        ? (employees.find(e => e.id === dept.head_of_department_id) ?? null)
        : null;
      const members = employees.filter(
        e => e.department_id === dept.id && e.id !== dept.head_of_department_id
      );
      return {
        id: dept.id,
        name: dept.name,
        description: dept.description,
        hod,
        members,
        headcount: members.length + (hod ? 1 : 0),
      };
    });
  }, [departments, employees]);

  // Leadership pseudo-node: super_admin + hr_admin
  const leadershipMembers = useMemo((): Employee[] => {
    return employees.filter(e => e.role === 'super_admin' || e.role === 'hr_admin');
  }, [employees]);

  // Unassigned employees (no department, not leadership)
  const unassignedMembers = useMemo((): Employee[] => {
    const deptIds = new Set(departments.map(d => d.id));
    return employees.filter(
      e =>
        e.role !== 'super_admin' &&
        e.role !== 'hr_admin' &&
        (e.department_id === null || !deptIds.has(e.department_id))
    );
  }, [departments, employees]);

  // Role groups for role view
  const roleGroups = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employees) {
      const list = map.get(e.role) ?? [];
      list.push(e);
      map.set(e.role, list);
    }
    return ROLE_ORDER
      .filter(r => map.has(r))
      .map(r => ({ role: r, employees: map.get(r)! }));
  }, [employees]);

  // ── Search filter ───────────────────────────────────────────────────────────
  const normalizedSearch = searchTerm.trim().toLowerCase();

  function deptMatchesSearch(node: DeptNode): boolean {
    if (!normalizedSearch) return false;
    const nameMatch = (e: Employee) =>
      fullName(e).toLowerCase().includes(normalizedSearch) ||
      e.employee_id.toLowerCase().includes(normalizedSearch);
    return (
      node.name.toLowerCase().includes(normalizedSearch) ||
      (node.hod !== null && nameMatch(node.hod)) ||
      node.members.some(nameMatch)
    );
  }

  function roleGroupMatchesSearch(rg: { role: string; employees: Employee[] }): boolean {
    if (!normalizedSearch) return false;
    return (
      roleLabel(rg.role).toLowerCase().includes(normalizedSearch) ||
      rg.employees.some(
        e =>
          fullName(e).toLowerCase().includes(normalizedSearch) ||
          e.employee_id.toLowerCase().includes(normalizedSearch)
      )
    );
  }

  // ── Summary stats ───────────────────────────────────────────────────────────
  const totalHeadcount = employees.length;
  const totalDepts = departments.length;

  // ── Org name from profile ───────────────────────────────────────────────────
  const orgName = 'Organisation';

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        {/* ── Page Header ────────────────────────────────────────────────────── */}
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">🏛️</span>
              Organisation Chart
            </h1>
            <p className="page-subtitle">
              View the company structure, departments, and reporting lines
            </p>
          </div>
          <div className="page-actions enhanced-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => window.print()}
              className="btn btn-secondary action-btn"
              title="Print org chart"
            >
              <span className="btn-icon">🖨️</span>
              Print
            </button>
            <NotificationBell />
          </div>
        </div>

        {/* ── Main Content ───────────────────────────────────────────────────── */}
        <div style={{ padding: '0 24px 40px' }}>

          {/* ── Org Summary Card ──────────────────────────────────────────────── */}
          <div style={{
            background: 'linear-gradient(135deg, var(--primary-600) 0%, var(--primary-700) 100%)',
            borderRadius: 12,
            padding: '20px 28px',
            color: '#fff',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}>
            <div style={{ fontSize: 36 }}>🏛️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.01em' }}>
                {orgName}
              </div>
              <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>
                {totalHeadcount} {totalHeadcount === 1 ? 'employee' : 'employees'}
                {' · '}
                {totalDepts} {totalDepts === 1 ? 'department' : 'departments'}
              </div>
            </div>
          </div>

          {/* ── Controls ──────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
            alignItems: 'center',
          }}>
            {/* Search */}
            <div style={{ flex: '1 1 220px', position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 14,
                color: 'var(--gray-400)',
                pointerEvents: 'none',
              }}>
                🔍
              </span>
              <input
                type="text"
                placeholder="Search by name or employee ID…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 32px',
                  borderRadius: 8,
                  border: '1px solid var(--gray-300)',
                  fontSize: 13,
                  color: 'var(--gray-800)',
                  background: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* View toggle */}
            <div style={{
              display: 'flex',
              background: 'var(--gray-100)',
              borderRadius: 8,
              padding: 3,
              gap: 2,
              flexShrink: 0,
            }}>
              {(['department', 'role'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: viewMode === mode ? '#fff' : 'transparent',
                    color: viewMode === mode ? 'var(--gray-900)' : 'var(--gray-500)',
                    boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {mode === 'department' ? '🏢 By Department' : '👔 By Role'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Loading / Error ────────────────────────────────────────────────── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--gray-500)' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              Loading org chart…
            </div>
          )}

          {error && (
            <div style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#dc2626',
              fontSize: 14,
              marginBottom: 24,
            }}>
              Failed to load data: {error}
            </div>
          )}

          {/* ── By Department View ────────────────────────────────────────────── */}
          {!loading && !error && viewMode === 'department' && (
            <>
              {/* Leadership pseudo-card */}
              {leadershipMembers.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--gray-400)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    margin: '0 0 12px',
                  }}>
                    Leadership
                  </h2>
                  <div style={{
                    background: '#fff',
                    borderRadius: 10,
                    border: '1px solid var(--gray-200)',
                    borderLeft: '4px solid var(--primary-600)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    padding: '16px 20px',
                    opacity: normalizedSearch && !leadershipMembers.some(e =>
                      fullName(e).toLowerCase().includes(normalizedSearch) ||
                      e.employee_id.toLowerCase().includes(normalizedSearch)
                    ) ? 0.35 : 1,
                    transition: 'opacity 0.2s ease',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}>
                      <h3 style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--gray-900)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        Leadership Team
                      </h3>
                      <span style={{
                        background: 'var(--gray-100)',
                        color: 'var(--gray-700)',
                        borderRadius: 20,
                        padding: '2px 9px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {leadershipMembers.length} 👥
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {leadershipMembers.map(e => (
                        <div key={e.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'var(--gray-50)',
                          border: '1px solid var(--gray-200)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          minWidth: 180,
                        }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--primary-600)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}>
                            {e.first_name[0]}{e.last_name[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>
                              {fullName(e)}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                              {roleLabel(e.role)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Department grid */}
              {deptNodes.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--gray-400)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    margin: '0 0 12px',
                  }}>
                    Departments
                  </h2>
                  <div className="org-chart-grid">
                    {deptNodes.map((node, idx) => {
                      const matched = deptMatchesSearch(node);
                      const dimmed = !!normalizedSearch && !matched;
                      return (
                        <DeptCard
                          key={node.id}
                          node={node}
                          colorIndex={idx}
                          dimmed={dimmed}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Unassigned */}
              {unassignedMembers.length > 0 && (
                <div>
                  <h2 style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--gray-400)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    margin: '0 0 12px',
                  }}>
                    Unassigned
                  </h2>
                  <DeptCard
                    node={{
                      id: '__unassigned__',
                      name: 'Unassigned',
                      description: 'Employees without a department',
                      hod: null,
                      members: unassignedMembers,
                      headcount: unassignedMembers.length,
                    }}
                    colorIndex={7}
                    dimmed={
                      !!normalizedSearch &&
                      !unassignedMembers.some(e =>
                        fullName(e).toLowerCase().includes(normalizedSearch) ||
                        e.employee_id.toLowerCase().includes(normalizedSearch)
                      )
                    }
                  />
                </div>
              )}

              {deptNodes.length === 0 && leadershipMembers.length === 0 && unassignedMembers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--gray-400)' }}>
                  No active employees found.
                </div>
              )}
            </>
          )}

          {/* ── By Role View ──────────────────────────────────────────────────── */}
          {!loading && !error && viewMode === 'role' && (
            <div className="org-chart-grid">
              {roleGroups.map((rg, idx) => {
                const matched = roleGroupMatchesSearch(rg);
                const dimmed = !!normalizedSearch && !matched;
                return (
                  <RoleGroupCard
                    key={rg.role}
                    role={rg.role}
                    employees={rg.employees}
                    colorIndex={idx}
                    dimmed={dimmed}
                  />
                );
              })}
              {roleGroups.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--gray-400)' }}>
                  No active employees found.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Inline CSS ──────────────────────────────────────────────────────── */}
      <style>{`
        .org-chart-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        @media (max-width: 1100px) {
          .org-chart-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 640px) {
          .org-chart-grid {
            grid-template-columns: 1fr;
          }
        }

        @media print {
          .sidebar,
          .sidebar-toggle,
          .page-actions {
            display: none !important;
          }

          .content {
            margin-left: 0 !important;
            padding: 0 !important;
          }

          .org-chart-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }

          body {
            background: #fff !important;
          }
        }
      `}</style>
    </div>
  );
}
