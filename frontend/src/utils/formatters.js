/**
 * Utility functions for formatting data throughout the application
 */

const EAT = 'Africa/Nairobi';

/** Date only — e.g. "03 May 2026" */
export const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { timeZone: EAT, day: '2-digit', month: 'short', year: 'numeric' });
};

/** Date + time — e.g. "03 May 2026, 14:30" */
export const formatDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { timeZone: EAT, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Time only — e.g. "14:30" */
export const formatTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', { timeZone: EAT, hour: '2-digit', minute: '2-digit' });
};

/** Today's date as YYYY-MM-DD in EAT */
export const todayEAT = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: EAT }); // en-CA → YYYY-MM-DD

/**
 * Format employee ID to FKF#### format
 * @param {string|number} id - The employee ID to format
 * @returns {string} Formatted employee ID (e.g., FKF7041, FKF0123)
 */
export const formatEmployeeId = (id) => {
  if (!id) return 'N/A';
  // Remove any existing FKF prefix and non-digits
  const numericId = id.toString().replace(/[^\d]/g, '');
  if (!numericId) return 'N/A';
  // Pad with zeros to ensure 4 digits
  const paddedId = numericId.padStart(4, '0');
  return `FKF${paddedId}`;
};

/**
 * Format phone number
 * @param {string} phone - The phone number to format
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phone) => {
  if (!phone) return 'N/A';
  // Add any phone formatting logic here
  return phone;
};

/**
 * Format currency
 * @param {number} amount - The amount to format
 * @param {string} currency - Currency code (default: KES)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = 'KES') => {
  if (amount === null || amount === undefined) return 'N/A';
  return `${currency} ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
