/**
 * Geofence Settings Component - Multi-Location Support
 * Allows HR Admins to manage multiple office locations with geofencing
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { clearGeofenceCache } from '../../config/geofenceConfig';
import './GeofenceSettings.css';

interface OfficeLocation {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  notification_title: string;
  notification_body: string;
  is_active: boolean;
  is_default: boolean;
}

interface AutoCheckoutSettings {
  auto_checkout_enabled: boolean;
  auto_checkout_time: string;
  grace_period_hours: number;
  geofence_exit_checkout: boolean;
}

const EMPTY_LOCATION: OfficeLocation = {
  name: '',
  latitude: 0,
  longitude: 0,
  radius: 100,
  notification_title: 'Welcome to Office!',
  notification_body: 'You are at the office. Tap to sign in.',
  is_active: true,
  is_default: false,
};

const DEFAULT_CHECKOUT_SETTINGS: AutoCheckoutSettings = {
  auto_checkout_enabled: false,
  auto_checkout_time: '18:00',
  grace_period_hours: 9,
  geofence_exit_checkout: false,
};

export const GeofenceSettings = () => {
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [editingLocation, setEditingLocation] = useState<OfficeLocation | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [checkoutSettings, setCheckoutSettings] = useState<AutoCheckoutSettings>(DEFAULT_CHECKOUT_SETTINGS);
  const [editingCheckoutSettings, setEditingCheckoutSettings] = useState(false);

  // Load locations and checkout settings from database
  useEffect(() => {
    loadLocations();
    loadCheckoutSettings();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('office_locations')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setLocations(data || []);
    } catch (error) {
      console.error('Error loading office locations:', error);
      setMessage({ type: 'error', text: 'Failed to load office locations' });
    } finally {
      setLoading(false);
    }
  };

  const loadCheckoutSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('auto_checkout_enabled, auto_checkout_time, grace_period_hours, geofence_exit_checkout')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('No checkout settings found, using defaults');
      } else if (data) {
        setCheckoutSettings({
          auto_checkout_enabled: data.auto_checkout_enabled ?? false,
          auto_checkout_time: data.auto_checkout_time?.substring(0, 5) ?? '18:00',
          grace_period_hours: data.grace_period_hours ?? 9,
          geofence_exit_checkout: data.geofence_exit_checkout ?? false,
        });
      }
    } catch (error) {
      console.error('Error loading checkout settings:', error);
    }
  };

  const saveCheckoutSettings = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const { error } = await supabase
        .from('attendance_settings')
        .update({
          auto_checkout_enabled: checkoutSettings.auto_checkout_enabled,
          auto_checkout_time: checkoutSettings.auto_checkout_time + ':00',
          grace_period_hours: checkoutSettings.grace_period_hours,
          geofence_exit_checkout: checkoutSettings.geofence_exit_checkout,
        })
        .limit(1);

      if (error) throw error;

      setMessage({ type: 'success', text: '✅ Auto-checkout settings saved successfully!' });
      setEditingCheckoutSettings(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving checkout settings:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save checkout settings'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGetCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setMessage({ type: 'error', text: 'Geolocation not supported by your browser' });
      return;
    }

    setGettingLocation(true);
    setMessage({ type: 'success', text: '📍 Getting your current location...' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: OfficeLocation = {
          ...EMPTY_LOCATION,
          name: 'New Office Location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setEditingLocation(location);
        setShowAddForm(true);
        setGettingLocation(false);
        setMessage({ 
          type: 'success', 
          text: `✅ Location captured! Accuracy: ${Math.round(position.coords.accuracy)}m` 
        });
      },
      (error) => {
        setGettingLocation(false);
        let errorMsg = 'Error getting location';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Location permission denied. Please enable location access.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Location unavailable. Please try again.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Location request timed out. Please try again.';
        }
        setMessage({ type: 'error', text: errorMsg });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleStartAdd = () => {
    setEditingLocation({ ...EMPTY_LOCATION });
    setShowAddForm(true);
  };

  const handleEdit = (location: OfficeLocation) => {
    setEditingLocation({ ...location });
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setEditingLocation(null);
    setShowAddForm(false);
    setMessage(null);
  };

  const handleChange = (field: keyof OfficeLocation, value: string | number | boolean) => {
    if (!editingLocation) return;
    setEditingLocation(prev => ({
      ...prev!,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!editingLocation) return;

    try {
      setSaving(true);
      setMessage(null);

      // Validation
      if (!editingLocation.name.trim()) {
        throw new Error('Please enter a location name');
      }
      if (editingLocation.latitude < -90 || editingLocation.latitude > 90) {
        throw new Error('Latitude must be between -90 and 90');
      }
      if (editingLocation.longitude < -180 || editingLocation.longitude > 180) {
        throw new Error('Longitude must be between -180 and 180');
      }
      if (editingLocation.radius < 10 || editingLocation.radius > 1000) {
        throw new Error('Radius must be between 10 and 1000 meters');
      }

      // If setting as default, unset other defaults first
      if (editingLocation.is_default) {
        await supabase
          .from('office_locations')
          .update({ is_default: false })
          .neq('id', editingLocation.id || 0);
      }

      let result;
      if (editingLocation.id) {
        // Update existing
        result = await supabase
          .from('office_locations')
          .update({
            name: editingLocation.name,
            latitude: editingLocation.latitude,
            longitude: editingLocation.longitude,
            radius: editingLocation.radius,
            notification_title: editingLocation.notification_title,
            notification_body: editingLocation.notification_body,
            is_active: editingLocation.is_active,
            is_default: editingLocation.is_default,
          })
          .eq('id', editingLocation.id);
      } else {
        // Insert new
        result = await supabase
          .from('office_locations')
          .insert([{
            name: editingLocation.name,
            latitude: editingLocation.latitude,
            longitude: editingLocation.longitude,
            radius: editingLocation.radius,
            notification_title: editingLocation.notification_title,
            notification_body: editingLocation.notification_body,
            is_active: editingLocation.is_active,
            is_default: editingLocation.is_default,
          }]);
      }

      if (result.error) throw result.error;

      // Clear cache and reload
      clearGeofenceCache();
      await loadLocations();

      setMessage({ 
        type: 'success', 
        text: `✅ ${editingLocation.id ? 'Updated' : 'Added'} location successfully!` 
      });
      handleCancel();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving location:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save location'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this office location?')) return;

    try {
      const { error } = await supabase
        .from('office_locations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      clearGeofenceCache();
      await loadLocations();
      setMessage({ type: 'success', text: '✅ Location deleted successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error deleting location:', error);
      setMessage({ type: 'error', text: 'Failed to delete location' });
    }
  };

  const handleTestLocation = (lat: number, lng: number) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="geofence-settings">
        <div className="loading-spinner">Loading office locations...</div>
      </div>
    );
  }

  return (
    <div className="geofence-settings">
      <div className="settings-header">
        <h2>📍 Office Locations & Geofencing</h2>
        <p className="settings-description">
          Manage multiple office locations with automatic check-in notifications for mobile staff
        </p>
      </div>

      {message && (
        <div className={`message-banner ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Quick Add with Current Location */}
      {!showAddForm && (
        <div className="quick-add-section">
          <div className="quick-add-card">
            <div className="quick-add-icon">📱</div>
            <div className="quick-add-content">
              <h3>Quick Add: Use Your Current Location</h3>
              <p>Capture your current GPS coordinates instantly for accurate geofencing</p>
              <button
                className="btn btn-primary btn-large"
                onClick={handleGetCurrentLocation}
                disabled={gettingLocation}
              >
                {gettingLocation ? '📍 Getting Location...' : '📍 Use My Current Location'}
              </button>
              <span className="or-divider">or</span>
              <button
                className="btn btn-secondary"
                onClick={handleStartAdd}
              >
                ➕ Add Location Manually
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && editingLocation && (
        <div className="location-form-section">
          <div className="form-header">
            <h3>{editingLocation.id ? '✏️ Edit Location' : '➕ Add New Location'}</h3>
            <button className="btn-close" onClick={handleCancel}>✕</button>
          </div>

          <div className="form-grid">
            {/* Basic Info */}
            <div className="form-section">
              <h4>Location Details</h4>
              
              <div className="form-group">
                <label htmlFor="name">
                  Location Name <span className="required">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={editingLocation.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Main Office, Branch 1, Warehouse"
                  maxLength={100}
                />
                <small>Give this location a descriptive name</small>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editingLocation.is_default}
                      onChange={(e) => handleChange('is_default', e.target.checked)}
                    />
                    {' '}Set as Default Location
                  </label>
                  <small>Default location appears first in mobile app</small>
                </div>

                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editingLocation.is_active}
                      onChange={(e) => handleChange('is_active', e.target.checked)}
                    />
                    {' '}Active
                  </label>
                  <small>Only active locations trigger notifications</small>
                </div>
              </div>
            </div>

            {/* Coordinates */}
            <div className="form-section">
              <h4>GPS Coordinates</h4>
              
              <div className="form-group">
                <label htmlFor="latitude">
                  Latitude <span className="required">*</span>
                </label>
                <input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  value={editingLocation.latitude}
                  onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || 0)}
                  placeholder="-1.286389"
                />
                <small>Range: -90 to 90</small>
              </div>

              <div className="form-group">
                <label htmlFor="longitude">
                  Longitude <span className="required">*</span>
                </label>
                <input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  value={editingLocation.longitude}
                  onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || 0)}
                  placeholder="36.817223"
                />
                <small>Range: -180 to 180</small>
              </div>

              <div className="button-group">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleGetCurrentLocation}
                  disabled={gettingLocation}
                >
                  📍 Update to Current Location
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleTestLocation(editingLocation.latitude, editingLocation.longitude)}
                >
                  🗺️ View on Map
                </button>
              </div>
            </div>

            {/* Geofence Settings */}
            <div className="form-section">
              <h4>Geofence Settings</h4>
              
              <div className="form-group">
                <label htmlFor="radius">
                  Radius (meters) <span className="required">*</span>
                </label>
                <input
                  id="radius"
                  type="number"
                  min="10"
                  max="1000"
                  value={editingLocation.radius}
                  onChange={(e) => handleChange('radius', parseInt(e.target.value) || 100)}
                />
                <div className="radius-info">
                  <span className="radius-value">{editingLocation.radius}m</span>
                  <span className="radius-label">
                    {editingLocation.radius < 50 && '• Very tight'}
                    {editingLocation.radius >= 50 && editingLocation.radius < 150 && '• Recommended'}
                    {editingLocation.radius >= 150 && editingLocation.radius < 300 && '• Large'}
                    {editingLocation.radius >= 300 && '• Very large'}
                  </span>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="form-section full-width">
              <h4>Notification Messages</h4>
              
              <div className="form-group">
                <label htmlFor="notif-title">
                  Notification Title <span className="required">*</span>
                </label>
                <input
                  id="notif-title"
                  type="text"
                  maxLength={100}
                  value={editingLocation.notification_title}
                  onChange={(e) => handleChange('notification_title', e.target.value)}
                  placeholder="Welcome to Main Office!"
                />
                <small>{editingLocation.notification_title.length}/100 characters</small>
              </div>

              <div className="form-group">
                <label htmlFor="notif-body">
                  Notification Message <span className="required">*</span>
                </label>
                <textarea
                  id="notif-body"
                  rows={3}
                  maxLength={200}
                  value={editingLocation.notification_body}
                  onChange={(e) => handleChange('notification_body', e.target.value)}
                  placeholder="You are at the office. Tap to sign in."
                />
                <small>{editingLocation.notification_body.length}/200 characters</small>
              </div>

              {/* Preview */}
              <div className="notification-preview">
                <div className="preview-label">Preview:</div>
                <div className="preview-notification">
                  <div className="preview-icon">📱</div>
                  <div className="preview-content">
                    <div className="preview-title">{editingLocation.notification_title}</div>
                    <div className="preview-body">{editingLocation.notification_body}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : editingLocation.id ? 'Update Location' : 'Add Location'}
            </button>
          </div>
        </div>
      )}

      {/* Locations List */}
      {!showAddForm && (
        <div className="locations-list-section">
          <div className="section-header">
            <h3>Configured Office Locations ({locations.length})</h3>
          </div>

          {locations.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏢</div>
              <h4>No office locations configured</h4>
              <p>Add your first office location to enable mobile geofencing</p>
            </div>
          ) : (
            <div className="locations-grid">
              {locations.map((location) => (
                <div key={location.id} className={`location-card ${!location.is_active ? 'inactive' : ''}`}>
                  <div className="location-header">
                    <div className="location-title">
                      <h4>{location.name}</h4>
                      {location.is_default && <span className="badge badge-default">Default</span>}
                      {!location.is_active && <span className="badge badge-inactive">Inactive</span>}
                    </div>
                    <div className="location-actions">
                      <button
                        className="btn-icon"
                        onClick={() => handleEdit(location)}
                        title="Edit location"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon"
                        onClick={() => location.id && handleDelete(location.id)}
                        title="Delete location"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="location-details">
                    <div className="detail-row">
                      <span className="label">📍 Coordinates:</span>
                      <span className="value">
                        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">📏 Radius:</span>
                      <span className="value">{location.radius}m</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">🔔 Notification:</span>
                      <span className="value">{location.notification_title}</span>
                    </div>
                  </div>

                  <div className="location-footer">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleTestLocation(location.latitude, location.longitude)}
                    >
                      🗺️ View on Map
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auto-Checkout Settings */}
      {!showAddForm && (
        <div className="auto-checkout-section">
          <div className="section-header">
            <h3>⏰ Automatic Check-Out Settings</h3>
            <p className="settings-description">
              Configure automatic check-out rules for staff attendance
            </p>
          </div>

          {editingCheckoutSettings ? (
            <div className="checkout-settings-form">
              {/* End-of-Day Auto-Checkout */}
              <div className="setting-card">
                <div className="setting-header">
                  <div className="setting-title">
                    <h4>🕐 End-of-Day Auto-Checkout</h4>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={checkoutSettings.auto_checkout_enabled}
                        onChange={(e) => setCheckoutSettings({
                          ...checkoutSettings,
                          auto_checkout_enabled: e.target.checked
                        })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <p className="setting-description">
                    Automatically check out staff at a specific time each day
                  </p>
                </div>
                {checkoutSettings.auto_checkout_enabled && (
                  <div className="setting-content">
                    <div className="form-group">
                      <label htmlFor="auto-checkout-time">Check-Out Time:</label>
                      <input
                        id="auto-checkout-time"
                        type="time"
                        value={checkoutSettings.auto_checkout_time}
                        onChange={(e) => setCheckoutSettings({
                          ...checkoutSettings,
                          auto_checkout_time: e.target.value
                        })}
                      />
                      <small>Staff will be automatically checked out at this time daily</small>
                    </div>
                  </div>
                )}
              </div>

              {/* Grace Period Auto-Checkout */}
              <div className="setting-card">
                <div className="setting-header">
                  <div className="setting-title">
                    <h4>⏳ Grace Period Auto-Checkout</h4>
                  </div>
                  <p className="setting-description">
                    Automatically check out staff after a maximum number of hours
                  </p>
                </div>
                <div className="setting-content">
                  <div className="form-group">
                    <label htmlFor="grace-period">Maximum Hours Before Auto-Checkout:</label>
                    <input
                      id="grace-period"
                      type="number"
                      min="1"
                      max="24"
                      value={checkoutSettings.grace_period_hours}
                      onChange={(e) => setCheckoutSettings({
                        ...checkoutSettings,
                        grace_period_hours: parseInt(e.target.value) || 9
                      })}
                    />
                    <small>Staff checked in for longer than this will be automatically checked out (default: 9 hours)</small>
                  </div>
                </div>
              </div>

              {/* Geofence Exit Auto-Checkout */}
              <div className="setting-card">
                <div className="setting-header">
                  <div className="setting-title">
                    <h4>📍 Geofence Exit Auto-Checkout</h4>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={checkoutSettings.geofence_exit_checkout}
                        onChange={(e) => setCheckoutSettings({
                          ...checkoutSettings,
                          geofence_exit_checkout: e.target.checked
                        })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <p className="setting-description">
                    Automatically check out staff when they leave the office geofence
                  </p>
                </div>
                {checkoutSettings.geofence_exit_checkout && (
                  <div className="setting-content">
                    <div className="alert alert-info">
                      <strong>📱 Mobile Only:</strong> This feature requires the mobile app with background location permission enabled.
                      Staff will be checked out automatically when they exit any configured office location.
                    </div>
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="form-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingCheckoutSettings(false);
                    loadCheckoutSettings(); // Reset to saved values
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveCheckoutSettings}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Checkout Settings'}
                </button>
              </div>
            </div>
          ) : (
            <div className="checkout-settings-view">
              <div className="settings-summary">
                <div className="summary-item">
                  <span className="summary-label">🕐 End-of-Day Auto-Checkout:</span>
                  <span className="summary-value">
                    {checkoutSettings.auto_checkout_enabled 
                      ? `✅ Enabled at ${checkoutSettings.auto_checkout_time}` 
                      : '❌ Disabled'}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">⏳ Grace Period:</span>
                  <span className="summary-value">{checkoutSettings.grace_period_hours} hours</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">📍 Geofence Exit Auto-Checkout:</span>
                  <span className="summary-value">
                    {checkoutSettings.geofence_exit_checkout ? '✅ Enabled' : '❌ Disabled'}
                  </span>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setEditingCheckoutSettings(true)}
              >
                ✏️ Edit Checkout Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      {!showAddForm && (
        <div className="info-box">
          <h4>ℹ️ Important Information:</h4>
          <ul>
            <li>📱 Changes apply to all mobile app users after they restart the app</li>
            <li>🔐 Background geofencing requires "Always Allow" location permission</li>
            <li>⏱️ Geofence triggers may have a 2-5 minute delay depending on device</li>
            <li>🏢 Multiple locations: Staff get notifications at whichever office they arrive at</li>
            <li>✅ Use "Default" location to prioritize which office appears first in the app</li>
            <li>📍 For best accuracy, use "Use Current Location" while physically at the office</li>
            <li>⏰ Auto-checkout settings apply to all locations and run daily at scheduled times</li>
          </ul>
        </div>
      )}
    </div>
  );
};
