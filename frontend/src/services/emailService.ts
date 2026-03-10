import { supabase } from '../lib/supabaseClient';

interface WelcomeEmailParams {
  email: string;
  fullName: string;
  password: string;
  role: string;
}

/**
 * Send welcome email with login credentials to new user
 */
export const sendWelcomeEmail = async (params: WelcomeEmailParams) => {
  try {
    // In production, this would call Supabase Edge Function
    // For now, we'll use a mock implementation
    
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials { background: white; padding: 20px; border-left: 4px solid #4f46e5; margin: 20px 0; border-radius: 4px; }
          .credential-item { margin: 10px 0; }
          .credential-label { font-weight: bold; color: #4f46e5; }
          .credential-value { font-family: 'Courier New', monospace; background: #f3f4f6; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-left: 10px; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; color: #6b7280; font-size: 0.875rem; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to FKF HR System</h1>
          </div>
          <div class="content">
            <h2>Hello ${params.fullName},</h2>
            <p>Your account has been created in the Football Kenya Federation Leave Management System.</p>
            
            <div class="credentials">
              <h3>Your Login Credentials:</h3>
              <div class="credential-item">
                <span class="credential-label">Email:</span>
                <span class="credential-value">${params.email}</span>
              </div>
              <div class="credential-item">
                <span class="credential-label">Temporary Password:</span>
                <span class="credential-value">${params.password}</span>
              </div>
              <div class="credential-item">
                <span class="credential-label">Role:</span>
                <span class="credential-value">${params.role}</span>
              </div>
            </div>
            
            <div class="warning">
              <strong>⚠️ Important Security Notice:</strong>
              <ul>
                <li>You will be required to change this password on your first login</li>
                <li>Never share your password with anyone</li>
                <li>Choose a strong, unique password when changing it</li>
              </ul>
            </div>
            
            <a href="${import.meta.env.VITE_APP_URL || 'http://localhost:5173'}/login" class="button">
              Login to Your Account
            </a>
            
            <p>If you have any questions or need assistance, please contact the HR department.</p>
            
            <div class="footer">
              <p>Football Kenya Federation<br/>
              HR Leave Management System</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // TODO: Replace with actual Supabase Edge Function call
    // const { data, error } = await supabase.functions.invoke('send-email', {
    //   body: {
    //     type: 'welcome',
    //     to: params.email,
    //     subject: 'Welcome to FKF HR System - Your Login Credentials',
    //     html: emailTemplate
    //   }
    // });

    // For now, log the email (in production, this would actually send)
    console.log('📧 Email would be sent to:', params.email);
    console.log('Email template ready:', emailTemplate);
    
    // Simulate successful email send
    return { 
      data: { success: true, message: 'Email sent successfully' }, 
      error: null 
    };
    
  } catch (error) {
    console.error('Email service error:', error);
    return { 
      data: null, 
      error: error as Error 
    };
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email: string) => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_URL || 'http://localhost:5173'}/reset-password`,
    });

    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Password reset email error:', error);
    return { data: null, error: error as Error };
  }
};
