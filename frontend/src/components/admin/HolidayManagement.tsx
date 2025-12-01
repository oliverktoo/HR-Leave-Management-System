import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';
import type { PublicHoliday } from '../../types';

type HolidayType = 'public' | 'national' | 'religious' | 'company';

interface HolidayFormData {
  name: string;
  date: string;
  description: string;
  is_recurring: boolean;
  holiday_type: HolidayType;
}

const HolidayManagement = () => {
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<PublicHoliday | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [modalData, setModalData] = useState<HolidayFormData>({
    name: '',
    date: '',
    description: '',
    is_recurring: false,
    holiday_type: 'public'
  });

  // Load holidays when component mounts or year changes
  useEffect(() => {
    loadHolidays();
  }, [selectedYear]);

  const loadHolidays = async () => {
    try {
      setLoading(true);
      
      // Get holidays for the selected year
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      
      const { data, error } = await supabase
        .from('public_holidays')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;
      setHolidays(data || []);
      
    } catch (error) {
      console.error('Error loading holidays:', error);
      alert('Error loading holidays: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHoliday = () => {
    setEditingHoliday(null);
    setModalData({
      name: '',
      date: '',
      description: '',
      is_recurring: false,
      holiday_type: 'public'
    });
    setShowModal(true);
  };

  const handleEditHoliday = (holiday: PublicHoliday) => {
    setEditingHoliday(holiday);
    setModalData({
      name: holiday.name,
      date: holiday.date,
      description: holiday.description || '',
      is_recurring: holiday.is_recurring,
      holiday_type: holiday.holiday_type as HolidayType
    });
    setShowModal(true);
  };

  const handleDeleteHoliday = async (holidayId: string, holidayName: string) => {
    if (!confirm(`Are you sure you want to delete "${holidayName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('public_holidays')
        .delete()
        .eq('id', holidayId);

      if (error) throw error;
      
      await loadHolidays();
      alert('Holiday deleted successfully');
      
    } catch (error) {
      console.error('Error deleting holiday:', error);
      alert('Error deleting holiday: ' + (error as Error).message);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      const holidayData = {
        name: modalData.name.trim(),
        date: modalData.date,
        description: modalData.description.trim(),
        is_recurring: modalData.is_recurring,
        holiday_type: modalData.holiday_type
      };

      if (editingHoliday) {
        const { error } = await supabase
          .from('public_holidays')
          .update(holidayData)
          .eq('id', editingHoliday.id);
          
        if (error) throw error;
        alert('Holiday updated successfully');
      } else {
        const { error } = await supabase
          .from('public_holidays')
          .insert([holidayData]);
          
        if (error) throw error;
        alert('Holiday added successfully');
      }

      setShowModal(false);
      await loadHolidays();
      
    } catch (error) {
      console.error('Error saving holiday:', error);
      alert('Error saving holiday: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const generatePresetHolidays = async () => {
    const currentYear = selectedYear;
    const presetHolidays = [
      {
        name: "New Year's Day",
        date: `${currentYear}-01-01`,
        description: "Start of the calendar year",
        is_recurring: true,
        holiday_type: 'public' as const
      },
      {
        name: "Good Friday",
        date: `${currentYear}-03-29`,
        description: "Christian holy day",
        is_recurring: true,
        holiday_type: 'religious' as const
      },
      {
        name: "Easter Monday",
        date: `${currentYear}-04-01`,
        description: "Christian holy day",
        is_recurring: true,
        holiday_type: 'religious' as const
      },
      {
        name: "Labour Day",
        date: `${currentYear}-05-01`,
        description: "International Workers' Day",
        is_recurring: true,
        holiday_type: 'public' as const
      },
      {
        name: "Madaraka Day",
        date: `${currentYear}-06-01`,
        description: "Kenya's self-governance day",
        is_recurring: true,
        holiday_type: 'national' as const
      },
      {
        name: "Mashujaa Day",
        date: `${currentYear}-10-20`,
        description: "Heroes' Day",
        is_recurring: true,
        holiday_type: 'national' as const
      },
      {
        name: "Jamhuri Day",
        date: `${currentYear}-12-12`,
        description: "Independence Day",
        is_recurring: true,
        holiday_type: 'national' as const
      },
      {
        name: "Christmas Day",
        date: `${currentYear}-12-25`,
        description: "Christmas celebration",
        is_recurring: true,
        holiday_type: 'religious' as const
      },
      {
        name: "Boxing Day",
        date: `${currentYear}-12-26`,
        description: "Day after Christmas",
        is_recurring: true,
        holiday_type: 'public' as const
      }
    ];

    if (!confirm(`Add ${presetHolidays.length} preset holidays for ${currentYear}?`)) {
      return;
    }

    try {
      setLoading(true);
      
      // Check for existing holidays to avoid duplicates
      const existingDates = holidays.map(h => h.date);
      const newHolidays = presetHolidays.filter(h => !existingDates.includes(h.date));
      
      if (newHolidays.length === 0) {
        alert('All preset holidays already exist for this year');
        return;
      }

      const { error } = await supabase
        .from('public_holidays')
        .insert(newHolidays);

      if (error) throw error;
      
      alert(`${newHolidays.length} holidays added successfully`);
      await loadHolidays();
      
    } catch (error) {
      console.error('Error adding preset holidays:', error);
      alert('Error adding preset holidays: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getHolidayTypeColor = (type: string): string => {
    switch (type) {
      case 'public': return 'var(--primary-600)';
      case 'national': return 'var(--success-600)';
      case 'religious': return 'var(--warning-600)';
      case 'company': return 'var(--secondary-600)';
      default: return 'var(--gray-600)';
    }
  };

  const getHolidayTypeIcon = (type: string): string => {
    switch (type) {
      case 'public': return '🏛️';
      case 'national': return '🇰🇪';
      case 'religious': return '⛪';
      case 'company': return '🏢';
      default: return '📅';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isUpcoming = (dateString: string): boolean => {
    return new Date(dateString) > new Date();
  };

  if (loading && holidays.length === 0) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading holidays...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">🗓️</span>
              Public Holiday Management
            </h1>
            <p className="page-subtitle">Manage company-wide holidays and observances</p>
          </div>
          <div className="page-actions enhanced-actions">
            <select
              className="form-select enhanced-select"
              value={selectedYear}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedYear(parseInt(e.target.value))}
              style={{ width: 'auto', minWidth: '120px' }}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - 1 + i;
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
            <button
              onClick={generatePresetHolidays}
              className="btn btn-secondary action-btn"
            >
              <span className="btn-icon">✨</span>
              Add Presets
            </button>
            <button
              onClick={handleAddHoliday}
              className="btn btn-primary action-btn"
            >
              <span className="btn-icon">➕</span>
              Add Holiday
            </button>
          </div>
        </div>

        {/* Holiday Statistics */}
        <div className="stats-grid admin-stats-grid mb-8">
          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-primary">📅</div>
              <div className="stats-details">
                <h3 className="stats-title">Total Holidays</h3>
                <p className="stats-value">{holidays.length}</p>
                <p className="stats-change">
                  <span className="text-muted">In {selectedYear}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-success">⏰</div>
              <div className="stats-details">
                <h3 className="stats-title">Upcoming</h3>
                <p className="stats-value">{holidays.filter(h => isUpcoming(h.date)).length}</p>
                <p className="stats-change">
                  <span className="text-muted">Remaining this year</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-warning">🔄</div>
              <div className="stats-details">
                <h3 className="stats-title">Recurring</h3>
                <p className="stats-value">{holidays.filter(h => h.is_recurring).length}</p>
                <p className="stats-change">
                  <span className="text-muted">Annual holidays</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-secondary">📝</div>
              <div className="stats-details">
                <h3 className="stats-title">Types</h3>
                <p className="stats-value">{new Set(holidays.map(h => h.holiday_type)).size}</p>
                <p className="stats-change">
                  <span className="text-muted">Different categories</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Holidays Calendar View */}
        <div className="holiday-calendar">
          <h2 className="section-title">
            <span className="section-icon">📅</span>
            {selectedYear} Holiday Calendar
          </h2>
          
          {holidays.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🗓️</div>
              <h3 className="empty-title">No holidays configured</h3>
              <p className="empty-description">
                Add holidays for {selectedYear} to help employees plan their leave requests.
              </p>
              <div className="empty-actions">
                <button onClick={generatePresetHolidays} className="btn btn-secondary">
                  <span className="btn-icon">✨</span>
                  Add Preset Holidays
                </button>
                <button onClick={handleAddHoliday} className="btn btn-primary">
                  <span className="btn-icon">➕</span>
                  Add Custom Holiday
                </button>
              </div>
            </div>
          ) : (
            <div className="holidays-grid">
              {holidays.map((holiday) => (
                <div 
                  key={holiday.id} 
                  className={`holiday-card ${isUpcoming(holiday.date) ? 'upcoming' : ''}`}
                >
                  <div className="holiday-header">
                    <div className="holiday-type">
                      <span className="type-icon">
                        {getHolidayTypeIcon(holiday.holiday_type)}
                      </span>
                      <span 
                        className="type-badge"
                        style={{ 
                          backgroundColor: getHolidayTypeColor(holiday.holiday_type) + '20',
                          color: getHolidayTypeColor(holiday.holiday_type)
                        }}
                      >
                        {holiday.holiday_type}
                      </span>
                    </div>
                    <div className="holiday-actions">
                      <button
                        onClick={() => handleEditHoliday(holiday)}
                        className="action-btn edit-btn"
                        title="Edit Holiday"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteHoliday(holiday.id, holiday.name)}
                        className="action-btn delete-btn"
                        title="Delete Holiday"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  <div className="holiday-content">
                    <h3 className="holiday-name">{holiday.name}</h3>
                    <p className="holiday-date">{formatDate(holiday.date)}</p>
                    {holiday.description && (
                      <p className="holiday-description">{holiday.description}</p>
                    )}
                  </div>
                  
                  <div className="holiday-footer">
                    {holiday.is_recurring && (
                      <span className="recurring-badge">
                        🔄 Annual
                      </span>
                    )}
                    {isUpcoming(holiday.date) && (
                      <span className="upcoming-badge">
                        ⏰ Upcoming
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Holiday Modal */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal holiday-modal">
              <div className="modal-header">
                <h2 className="modal-title">
                  <span className="modal-icon">🗓️</span>
                  {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="modal-content">
                  <div className="form-section">
                    <div className="form-row">
                      <div className="enhanced-form-group">
                        <label className="form-label">
                          <span className="label-icon">📝</span>
                          Holiday Name*
                        </label>
                        <input
                          type="text"
                          className="form-input enhanced-input"
                          value={modalData.name}
                          onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                          placeholder="Enter holiday name"
                          required
                        />
                      </div>

                      <div className="enhanced-form-group">
                        <label className="form-label">
                          <span className="label-icon">📅</span>
                          Date*
                        </label>
                        <input
                          type="date"
                          className="form-input enhanced-input"
                          value={modalData.date}
                          onChange={(e) => setModalData({ ...modalData, date: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="enhanced-form-group">
                      <label className="form-label">
                        <span className="label-icon">📋</span>
                        Description
                      </label>
                      <textarea
                        className="form-textarea enhanced-textarea"
                        value={modalData.description}
                        onChange={(e) => setModalData({ ...modalData, description: e.target.value })}
                        placeholder="Optional description"
                        rows={3}
                      />
                    </div>

                    <div className="form-row">
                      <div className="enhanced-form-group">
                        <label className="form-label">
                          <span className="label-icon">🏷️</span>
                          Holiday Type*
                        </label>
                        <select
                          className="form-select enhanced-select"
                          value={modalData.holiday_type}
                          onChange={(e) => setModalData({ ...modalData, holiday_type: e.target.value as HolidayType })}
                          required
                        >
                          <option value="public">🏛️ Public Holiday</option>
                          <option value="national">🇰🇪 National Holiday</option>
                          <option value="religious">⛪ Religious Holiday</option>
                          <option value="company">🏢 Company Holiday</option>
                        </select>
                      </div>

                      <div className="enhanced-form-group">
                        <label className="form-label">
                          <span className="label-icon">🔄</span>
                          Recurring Options
                        </label>
                        <label className="checkbox-container">
                          <input
                            type="checkbox"
                            checked={modalData.is_recurring}
                            onChange={(e) => setModalData({ ...modalData, is_recurring: e.target.checked })}
                          />
                          <span className="checkbox-label">Repeat annually</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    <span className="btn-icon">
                      {loading ? '⏳' : editingHoliday ? '💾' : '➕'}
                    </span>
                    {loading ? 'Saving...' : editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HolidayManagement;
