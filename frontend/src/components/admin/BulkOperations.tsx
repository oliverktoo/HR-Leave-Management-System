// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';

type OperationType = 'import_users' | 'update_leave_balances';

interface ImportResults {
  success: number;
  failed: number;
  errors: string[];
}

interface BulkUpdateData {
  department_id: string;
  leave_type_id: string;
  year: number;
  allocation: number;
}

const BulkOperations = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [operationType, setOperationType] = useState<OperationType>('import_users');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [ validationErrors, setValidationErrors] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  
  const [bulkUpdate, setBulkUpdate] = useState<any>({
    department_id: '',
    role: '',
    is_active: true,
    leave_balance_adjustment: 0
  });
  
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [carryforwardLoading, setCarryforwardLoading] = useState(false);
  const [carryforwardResults, setCarryforwardResults] = useState<any | null>(null);

  // Load departments when component mounts
  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setDepartments(data || []);
      
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }

    return data;
  };

  const validateUserData = (data: any[]): any[] => {
    const errors: any[] = [];
    const requiredFields = ['email', 'full_name', 'employee_id'];
    
    data.forEach((row, index) => {
      const rowErrors = [];
      
      // Check required fields
      requiredFields.forEach(field => {
        if (!row[field] || row[field].trim() === '') {
          rowErrors.push(`Missing ${field}`);
        }
      });

      // Validate email format
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        rowErrors.push('Invalid email format');
      }

      // Validate employee_id uniqueness (basic check)
      const duplicates = data.filter((r: any) => r.employee_id === row.employee_id);
      if (duplicates.length > 1) {
        rowErrors.push('Duplicate employee_id in file');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: index + 1,
          data: row,
          errors: rowErrors
        });
      }
    });

    return errors;
  };

  const validateLeaveBalanceData = (data: any[]): any[] => {
    const errors: any[] = [];
    const requiredFields = ['employee_id', 'leave_type', 'balance'];
    
    data.forEach((row, index) => {
      const rowErrors = [];
      
      requiredFields.forEach(field => {
        if (!row[field] || row[field].trim() === '') {
          rowErrors.push(`Missing ${field}`);
        }
      });

      // Validate balance is a number
      if (row.balance && isNaN(parseFloat(row.balance))) {
        rowErrors.push('Balance must be a number');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: index + 1,
          data: row,
          errors: rowErrors
        });
      }
    });

    return errors;
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const { headers, data } = parseCSV(text);
        
        setCsvData(data);
        setShowPreview(true);
        
        // Validate based on operation type
        let errors = [];
        if (operationType === 'import_users') {
          errors = validateUserData(data);
        } else if (operationType === 'update_leave_balances') {
          errors = validateLeaveBalanceData(data);
        }
        
        setValidationErrors(errors);
        
      } catch (error) {
        alert('Error parsing CSV file: ' + error.message);
      }
    };
    
    reader.readAsText(file);
  };

  const executeImportUsers = async () => {
    try {
      setLoading(true);
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const userData of csvData) {
        try {
          // Create auth user first
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: userData.email,
            password: userData.password || 'DefaultPass123!',
            email_confirm: true,
            user_metadata: {
              full_name: userData.full_name,
              role: userData.role || 'employee'
            }
          });

          if (authError) throw authError;

          // Create user profile
          const profileData = {
            id: authData.user.id,
            full_name: userData.full_name,
            employee_id: userData.employee_id,
            email: userData.email,
            department_id: userData.department_id || null,
            role: userData.role || 'employee',
            phone: userData.phone || null,
            is_active: true
          };

          const { error: profileError } = await supabase
            .from('users_profile')
            .insert([profileData]);

          if (profileError) throw profileError;

          // Initialize leave balances if department is specified
          if (userData.department_id) {
            const { data: leaveTypes } = await supabase
              .from('leave_types')
              .select('*')
              .eq('is_active', true);

            if (leaveTypes) {
              const balanceData = leaveTypes.map(type => ({
                user_id: authData.user.id,
                leave_type_id: type.id,
                total_days: type.default_days || 0,
                used_days: 0,
                remaining_days: type.default_days || 0,
                year: new Date().getFullYear()
              }));

              await supabase
                .from('leave_balances')
                .insert(balanceData);
            }
          }

          results.successful++;
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: userData,
            error: error.message
          });
        }
      }

      setImportResults(results);
      alert(`Import completed: ${results.successful} successful, ${results.failed} failed`);
      
    } catch (error) {
      alert('Import failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const executeUpdateLeaveBalances = async () => {
    try {
      setLoading(true);
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const balanceData of csvData) {
        try {
          // Find user by employee_id
          const { data: userData, error: userError } = await supabase
            .from('users_profile')
            .select('id')
            .eq('employee_id', balanceData.employee_id)
            .single();

          if (userError || !userData) {
            throw new Error(`User not found: ${balanceData.employee_id}`);
          }

          // Find leave type
          const { data: leaveTypeData, error: typeError } = await supabase
            .from('leave_types')
            .select('id')
            .eq('name', balanceData.leave_type)
            .single();

          if (typeError || !leaveTypeData) {
            throw new Error(`Leave type not found: ${balanceData.leave_type}`);
          }

          // Update or create leave balance
          const currentYear = new Date().getFullYear();
          const newBalance = parseFloat(balanceData.balance);

          const { error: balanceError } = await supabase
            .from('leave_balances')
            .upsert({
              user_id: userData.id,
              leave_type_id: leaveTypeData.id,
              year: currentYear,
              total_days: newBalance,
              remaining_days: newBalance,
              used_days: 0
            });

          if (balanceError) throw balanceError;

          results.successful++;
          
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: balanceData,
            error: error.message
          });
        }
      }

      setImportResults(results);
      alert(`Update completed: ${results.successful} successful, ${results.failed} failed`);
      
    } catch (error) {
      alert('Update failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const executeOperation = () => {
    if (validationErrors.length > 0) {
      alert('Please fix validation errors before proceeding');
      return;
    }

    if (!confirm(`Are you sure you want to ${operationType.replace('_', ' ')} ${csvData.length} records?`)) {
      return;
    }

    switch (operationType) {
      case 'import_users':
        executeImportUsers();
        break;
      case 'update_leave_balances':
        executeUpdateLeaveBalances();
        break;
      default:
        alert('Operation not implemented');
    }
  };

  const handleManualCarryforward = async () => {
    if (!confirm('Run year-end carryforward process? This will calculate unused leave days and create next year\'s balances with carryforward.')) {
      return;
    }

    setCarryforwardLoading(true);
    setCarryforwardResults(null);

    try {
      const response = await fetch(
        'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setCarryforwardResults(result);

      if (result.success) {
        alert(`✅ Carryforward complete!\n\n${result.message}\n\nProcessed: ${result.processed} balances`);
      } else {
        alert('⚠️ Carryforward completed with errors. Check results below.');
      }
    } catch (error) {
      console.error('Carryforward error:', error);
      alert('❌ Failed to run carryforward: ' + error.message);
      setCarryforwardResults({
        success: false,
        error: error.message
      });
    } finally {
      setCarryforwardLoading(false);
    }
  };

  const downloadTemplate = () => {
    let csvContent = '';
    
    switch (operationType) {
      case 'import_users':
        csvContent = 'email,full_name,employee_id,department_id,role,phone,password\n';
        csvContent += 'john.doe@company.com,John Doe,EMP001,1,employee,+254700000000,TempPass123!\n';
        csvContent += 'jane.smith@company.com,Jane Smith,EMP002,2,hod,+254700000001,TempPass123!\n';
        break;
      case 'update_leave_balances':
        csvContent = 'employee_id,leave_type,balance\n';
        csvContent += 'EMP001,Annual Leave,21\n';
        csvContent += 'EMP001,Sick Leave,10\n';
        csvContent += 'EMP002,Annual Leave,21\n';
        break;
      default:
        return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${operationType}_template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearData = () => {
    setCsvFile(null);
    setCsvData([]);
    setValidationErrors([]);
    setShowPreview(false);
    setImportResults(null);
    document.getElementById('csvFileInput').value = '';
  };

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">📦</span>
              Bulk Operations & CSV Import
            </h1>
            <p className="page-subtitle">Import users, update leave balances, and perform bulk operations</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={downloadTemplate}
              className="btn btn-secondary action-btn"
            >
              <span className="btn-icon">📄</span>
              Download Template
            </button>
            <button
              onClick={clearData}
              className="btn btn-outline action-btn"
              disabled={!csvFile}
            >
              <span className="btn-icon">🗑️</span>
              Clear Data
            </button>
          </div>
        </div>

        {/* Operation Selection */}
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">
              <span className="section-icon">🔧</span>
              Select Operation
            </h3>
          </div>
          <div className="operation-selection">
            <div className="operation-grid">
              <label className={`operation-option ${operationType === 'import_users' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="operationType"
                  value="import_users"
                  checked={operationType === 'import_users'}
                  onChange={(e) => setOperationType(e.target.value)}
                />
                <div className="option-content">
                  <div className="option-icon">👥</div>
                  <h4 className="option-title">Import Users</h4>
                  <p className="option-desc">Bulk import new employees with profiles and initial leave balances</p>
                </div>
              </label>

              <label className={`operation-option ${operationType === 'update_leave_balances' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="operationType"
                  value="update_leave_balances"
                  checked={operationType === 'update_leave_balances'}
                  onChange={(e) => setOperationType(e.target.value)}
                />
                <div className="option-content">
                  <div className="option-icon">📊</div>
                  <h4 className="option-title">Update Leave Balances</h4>
                  <p className="option-desc">Bulk update leave balances for existing employees</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Year-End Carryforward */}
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">
              <span className="section-icon">📅</span>
              Year-End Carryforward
            </h3>
          </div>
          <div className="p-6">
            <p className="text-gray-600 mb-4">
              Manually trigger the year-end carryforward process to calculate unused leave days 
              and create next year's balances. This process normally runs automatically on January 1st.
            </p>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-yellow-400 text-xl">⚠️</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Warning:</strong> This process will create leave balances for all active employees 
                    for the next year. Only run this manually if you need to process carryforward before 
                    the scheduled automatic execution.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={handleManualCarryforward}
              className="btn btn-primary"
              disabled={carryforwardLoading}
            >
              <span className="btn-icon">{carryforwardLoading ? '⏳' : '🚀'}</span>
              {carryforwardLoading ? 'Processing Carryforward...' : 'Run Year-End Carryforward'}
            </button>

            {/* Carryforward Results */}
            {carryforwardResults && (
              <div className={`mt-6 p-4 rounded-lg ${carryforwardResults.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <h4 className={`font-bold mb-2 ${carryforwardResults.success ? 'text-green-800' : 'text-red-800'}`}>
                  {carryforwardResults.success ? '✅ Success' : '❌ Error'}
                </h4>
                {carryforwardResults.message && (
                  <p className={carryforwardResults.success ? 'text-green-700' : 'text-red-700'}>
                    {carryforwardResults.message}
                  </p>
                )}
                {carryforwardResults.processed !== undefined && (
                  <p className="text-sm text-gray-600 mt-2">
                    Processed balances: {carryforwardResults.processed}
                  </p>
                )}
                {carryforwardResults.errors && carryforwardResults.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-red-800">Errors ({carryforwardResults.errors.length}):</p>
                    <ul className="list-disc pl-5 text-sm text-red-700 mt-1">
                      {carryforwardResults.errors.slice(0, 5).map((err, idx) => (
                        <li key={idx}>User: {err.user_id}, Leave Type: {err.leave_type_id} - {err.error}</li>
                      ))}
                      {carryforwardResults.errors.length > 5 && (
                        <li>... and {carryforwardResults.errors.length - 5} more errors</li>
                      )}
                    </ul>
                  </div>
                )}
                {carryforwardResults.error && (
                  <p className="text-sm text-red-700 mt-2">{carryforwardResults.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* File Upload */}
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">
              <span className="section-icon">📁</span>
              Upload CSV File
            </h3>
          </div>
          <div className="upload-section">
            <div className="upload-area">
              <input
                id="csvFileInput"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="file-input"
              />
              <label htmlFor="csvFileInput" className="upload-label">
                <div className="upload-icon">📁</div>
                <div className="upload-text">
                  <h4>Choose CSV file to upload</h4>
                  <p>Select a CSV file containing the data for {operationType.replace('_', ' ')}</p>
                </div>
              </label>
            </div>
            
            {csvFile && (
              <div className="file-info">
                <div className="file-details">
                  <span className="file-name">📄 {csvFile.name}</span>
                  <span className="file-size">({(csvFile.size / 1024).toFixed(1)} KB)</span>
                </div>
                <span className="file-records">{csvData.length} records found</span>
              </div>
            )}
          </div>
        </div>

        {/* Validation Results */}
        {showPreview && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">
                <span className="section-icon">✅</span>
                Validation Results
              </h3>
            </div>
            
            <div className="validation-summary">
              <div className="summary-stats">
                <div className="stat-item valid">
                  <span className="stat-icon">✅</span>
                  <span className="stat-value">{csvData.length - validationErrors.length}</span>
                  <span className="stat-label">Valid Records</span>
                </div>
                <div className="stat-item error">
                  <span className="stat-icon">❌</span>
                  <span className="stat-value">{validationErrors.length}</span>
                  <span className="stat-label">Errors</span>
                </div>
              </div>

              {validationErrors.length > 0 && (
                <div className="error-details">
                  <h4 className="error-title">Validation Errors</h4>
                  <div className="error-list">
                    {validationErrors.slice(0, 10).map((error, index) => (
                      <div key={index} className="error-item">
                        <span className="error-row">Row {error.row}:</span>
                        <span className="error-messages">{error.errors.join(', ')}</span>
                      </div>
                    ))}
                    {validationErrors.length > 10 && (
                      <div className="error-more">
                        ... and {validationErrors.length - 10} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Data Preview */}
        {showPreview && csvData.length > 0 && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">
                <span className="section-icon">👁️</span>
                Data Preview
              </h3>
            </div>
            
            <div className="table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    {Object.keys(csvData[0]).map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 5).map((row, index) => (
                    <tr key={index}>
                      {Object.values(row).map((value, cellIndex) => (
                        <td key={cellIndex}>{value}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvData.length > 5 && (
                <div className="preview-footer">
                  Showing 5 of {csvData.length} records
                </div>
              )}
            </div>
          </div>
        )}

        {/* Execute Button */}
        {showPreview && csvData.length > 0 && (
          <div className="execution-section">
            <div className="execution-warning">
              <span className="warning-icon">⚠️</span>
              <p>
                This operation will process {csvData.length} records. 
                {validationErrors.length > 0 && ' Please fix validation errors before proceeding.'}
              </p>
            </div>
            
            <div className="execution-actions">
              <button
                onClick={executeOperation}
                className="btn btn-primary execute-btn"
                disabled={loading || validationErrors.length > 0}
              >
                <span className="btn-icon">
                  {loading ? '⏳' : '🚀'}
                </span>
                {loading ? 'Processing...' : `Execute ${operationType.replace('_', ' ')}`}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {importResults && (
          <div className="card results-card">
            <div className="card-header">
              <h3 className="card-title">
                <span className="section-icon">📊</span>
                Operation Results
              </h3>
            </div>
            
            <div className="results-summary">
              <div className="result-stats">
                <div className="result-stat success">
                  <span className="stat-number">{importResults.successful}</span>
                  <span className="stat-label">Successful</span>
                </div>
                <div className="result-stat error">
                  <span className="stat-number">{importResults.failed}</span>
                  <span className="stat-label">Failed</span>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="result-errors">
                  <h4 className="error-title">Failed Records</h4>
                  <div className="error-list">
                    {importResults.errors.slice(0, 5).map((error, index) => (
                      <div key={index} className="error-item">
                        <span className="error-record">
                          {error.row.email || error.row.employee_id}:
                        </span>
                        <span className="error-message">{error.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkOperations;