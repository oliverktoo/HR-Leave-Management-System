// Trip Request Modal Component
// Modal version of the trip request form

import { useState, useEffect } from 'react';
import { createTripRequest, getAvailableVehicles, getVehicles } from '../../services/fleetService';
import { CreateTripRequestInput, FleetVehicle } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';

type FormStep = 'journey' | 'passengers' | 'preferences' | 'review';

interface TripRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TripRequestModal({ isOpen, onClose, onSuccess }: TripRequestModalProps) {
  const { profile } = useAuth();
  const [currentStep, setCurrentStep] = useState<FormStep>('journey');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<FleetVehicle[]>([]);
  const [allVehicles, setAllVehicles] = useState<FleetVehicle[]>([]);

  const [formData, setFormData] = useState<CreateTripRequestInput>({
    pickup_location: '',
    destination: '',
    start_datetime: '',
    end_datetime: '',
    purpose: '',
    passenger_count: 1,
    passengers: [],
    requires_driver: true,
  });

  const [passengers, setPassengers] = useState<string[]>(['']);

  useEffect(() => {
    if (isOpen) {
      loadVehicles();
      resetForm();
    }
  }, [isOpen]);

  const loadVehicles = async () => {
    try {
      const vehicles = await getVehicles({ status: 'available' });
      setAllVehicles(vehicles);
    } catch (err) {
      console.error('Error loading vehicles:', err);
    }
  };

  const checkAvailability = async () => {
    if (formData.start_datetime && formData.end_datetime) {
      try {
        const available = await getAvailableVehicles(
          formData.start_datetime,
          formData.end_datetime,
          formData.passenger_count
        );
        setAvailableVehicles(available);
      } catch (err) {
        console.error('Error checking availability:', err);
      }
    }
  };

  useEffect(() => {
    checkAvailability();
  }, [formData.start_datetime, formData.end_datetime, formData.passenger_count]);

  const steps: { id: FormStep; label: string; icon: string }[] = [
    { id: 'journey', label: 'Journey Details', icon: '📍' },
    { id: 'passengers', label: 'Passengers', icon: '👥' },
    { id: 'preferences', label: 'Preferences', icon: '⚙️' },
    { id: 'review', label: 'Review & Submit', icon: '✅' },
  ];

  const handleChange = (field: keyof CreateTripRequestInput, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePassengerChange = (index: number, value: string) => {
    const newPassengers = [...passengers];
    newPassengers[index] = value;
    setPassengers(newPassengers);
    
    handleChange('passengers', newPassengers.filter(p => p.trim()));
    handleChange('passenger_count', newPassengers.filter(p => p.trim()).length + 1);
  };

  const addPassenger = () => {
    setPassengers([...passengers, '']);
  };

  const removePassenger = (index: number) => {
    const newPassengers = passengers.filter((_, i) => i !== index);
    setPassengers(newPassengers);
    handleChange('passengers', newPassengers.filter(p => p.trim()));
    handleChange('passenger_count', newPassengers.filter(p => p.trim()).length + 1);
  };

  const validateStep = (): boolean => {
    setError(null);

    switch (currentStep) {
      case 'journey':
        if (!formData.pickup_location?.trim()) {
          setError('Please enter a pickup location');
          return false;
        }
        if (!formData.destination.trim()) {
          setError('Please enter a destination');
          return false;
        }
        if (!formData.start_datetime) {
          setError('Please select a departure date and time');
          return false;
        }
        if (!formData.end_datetime) {
          setError('Please select a return date and time');
          return false;
        }
        if (new Date(formData.start_datetime) >= new Date(formData.end_datetime)) {
          setError('Return time must be after departure time. Check AM/PM - 12:30 AM is midnight, 12:30 PM is noon.');
          return false;
        }
        if (new Date(formData.start_datetime) < new Date()) {
          setError('Departure time cannot be in the past');
          return false;
        }
        if (!formData.purpose.trim()) {
          setError('Please enter the purpose of the trip');
          return false;
        }
        return true;

      case 'passengers':
      case 'preferences':
      case 'review':
        return true;

      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateStep()) return;

    const stepOrder: FormStep[] = ['journey', 'passengers', 'preferences', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const stepOrder: FormStep[] = ['journey', 'passengers', 'preferences', 'review'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  const resetForm = () => {
    setFormData({
      pickup_location: '',
      destination: '',
      start_datetime: '',
      end_datetime: '',
      purpose: '',
      passenger_count: 1,
      passengers: [],
      requires_driver: true,
    });
    setPassengers(['']);
    setCurrentStep('journey');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    try {
      setLoading(true);
      await createTripRequest(formData);
      onSuccess();
      onClose();
      resetForm();
    } catch (err) {
      console.error('Error creating trip request:', err);
      setError(err instanceof Error ? err.message : 'Failed to create trip request');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'journey':
        return (
          <div className="step-content">
            <div className="form-group">
              <label className="required">Pickup Location</label>
              <input
                type="text"
                className="form-control"
                value={formData.pickup_location}
                onChange={(e) => handleChange('pickup_location', e.target.value)}
                placeholder="e.g., FKF House, Kasarani"
              />
            </div>

            <div className="form-group">
              <label className="required">Destination</label>
              <input
                type="text"
                className="form-control"
                value={formData.destination}
                onChange={(e) => handleChange('destination', e.target.value)}
                placeholder="e.g., Moi Stadium, Kisumu"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="required">Departure Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={formData.start_datetime}
                  onChange={(e) => handleChange('start_datetime', e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>

              <div className="form-group">
                <label className="required">Return Date & Time</label>
                <input
                  type="datetime-local"
                  className="form-control"
                  value={formData.end_datetime}
                  onChange={(e) => handleChange('end_datetime', e.target.value)}
                  min={formData.start_datetime || new Date().toISOString().slice(0, 16)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="required">Purpose of Trip</label>
              <textarea
                className="form-control"
                value={formData.purpose}
                onChange={(e) => handleChange('purpose', e.target.value)}
                placeholder="Describe the purpose of this trip..."
                rows={3}
              />
            </div>

            {formData.start_datetime && formData.end_datetime && (
              <div className="availability-info">
                {availableVehicles.length > 0 ? (
                  <div className="alert alert-success">
                    ✅ {availableVehicles.length} vehicle(s) available for this time period
                  </div>
                ) : (
                  <div className="alert alert-warning">
                    ⚠️ No vehicles currently showing as available. Your request will still be submitted for manual assignment.
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'passengers':
        return (
          <div className="step-content">
            <p className="step-description">
              Add the names of passengers travelling with you. You are automatically included.
            </p>

            <div className="passengers-list">
              <div className="passenger-item requester">
                <span className="passenger-icon">👤</span>
                <span className="passenger-name">
                  {profile?.first_name} {profile?.last_name} (You)
                </span>
              </div>

              {passengers.map((passenger, index) => (
                <div key={index} className="passenger-item">
                  <span className="passenger-icon">👥</span>
                  <input
                    type="text"
                    className="form-control"
                    value={passenger}
                    onChange={(e) => handlePassengerChange(index, e.target.value)}
                    placeholder="Passenger name"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removePassenger(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-secondary mt-2"
                onClick={addPassenger}
              >
                + Add Passenger
              </button>
            </div>

            <div className="passenger-summary mt-3">
              <strong>Total Passengers:</strong> {formData.passenger_count}
            </div>
          </div>
        );

      case 'preferences':
        return (
          <div className="step-content">
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.requires_driver}
                  onChange={(e) => handleChange('requires_driver', e.target.checked)}
                />
                {' '}I need a driver
              </label>
              <small className="form-text">
                Uncheck if you will be driving yourself
              </small>
            </div>

            {allVehicles.length > 0 && (
              <div className="form-group">
                <label>Preferred Vehicle (Optional)</label>
                <select
                  className="form-control"
                  value={formData.preferred_vehicle_id || ''}
                  onChange={(e) => handleChange('preferred_vehicle_id', e.target.value || undefined)}
                >
                  <option value="">No preference</option>
                  {allVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate_number} - {vehicle.make} {vehicle.model} ({vehicle.seating_capacity} seats)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Special Requirements</label>
              <textarea
                className="form-control"
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Any special requirements for this trip..."
                rows={3}
              />
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="step-content">
            <h3>Review Your Trip Request</h3>
            
            <div className="review-section">
              <h4>📍 Journey Details</h4>
              <div className="review-item">
                <span className="review-label">From:</span>
                <span className="review-value">{formData.pickup_location}</span>
              </div>
              <div className="review-item">
                <span className="review-label">To:</span>
                <span className="review-value">{formData.destination}</span>
              </div>
              <div className="review-item">
                <span className="review-label">Departure:</span>
                <span className="review-value">
                  {new Date(formData.start_datetime).toLocaleString()}
                </span>
              </div>
              <div className="review-item">
                <span className="review-label">Return:</span>
                <span className="review-value">
                  {new Date(formData.end_datetime).toLocaleString()}
                </span>
              </div>
              <div className="review-item">
                <span className="review-label">Purpose:</span>
                <span className="review-value">{formData.purpose}</span>
              </div>
            </div>

            <div className="review-section">
              <h4>👥 Passengers ({formData.passenger_count})</h4>
              <ul>
                <li>{profile?.first_name} {profile?.last_name} (You)</li>
                {formData.passengers?.map((passenger, index) => (
                  <li key={index}>{passenger}</li>
                ))}
              </ul>
            </div>

            <div className="review-section">
              <h4>⚙️ Preferences</h4>
              <div className="review-item">
                <span className="review-label">Driver Required:</span>
                <span className="review-value">{formData.requires_driver ? 'Yes' : 'No'}</span>
              </div>
              {formData.notes && (
                <div className="review-item">
                  <span className="review-label">Special Requirements:</span>
                  <span className="review-value">{formData.notes}</span>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚗 Request a Trip</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Progress Steps */}
          <div className="form-steps">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`step-item ${
                  currentStep === step.id ? 'active' : 
                  steps.findIndex(s => s.id === currentStep) > index ? 'completed' : ''
                }`}
              >
                <div className="step-icon">{step.icon}</div>
                <div className="step-label">{step.label}</div>
              </div>
            ))}
          </div>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {renderStepContent()}
        </div>

        <div className="modal-footer">
          {currentStep !== 'journey' && (
            <button 
              type="button"
              className="btn btn-secondary"
              onClick={prevStep}
            >
              ← Previous
            </button>
          )}
          
          <div style={{ flex: 1 }}></div>
          
          {currentStep !== 'review' ? (
            <button 
              type="button"
              className="btn btn-primary"
              onClick={nextStep}
            >
              Next →
            </button>
          ) : (
            <button 
              type="button"
              className="btn btn-success"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Submitting...' : '✅ Submit Request'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TripRequestModal;
