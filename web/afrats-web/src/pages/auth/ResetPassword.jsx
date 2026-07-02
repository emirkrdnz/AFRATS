import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import authApi from '../../api/authApi';
import { extractErrorMessage } from '../../api/errorHelper';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Token email link'inde URL query param olarak gelir.
  // Yoksa kullanıcı doğrudan /reset-password'a gelmiş demektir → uyarı göster.
  if (!token) {
    return (
      <>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Invalid reset link</h2>
        <p className="text-sm text-gray-500 mb-6">
          This page requires a valid reset token from your email. Please request a new reset link.
        </p>
        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-secondary font-medium hover:underline">
            Request new reset link
          </Link>
        </div>
      </>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, newPassword, confirmPassword);
      // Login sayfasına yönlendir, success mesajı bırak (Login.jsx info banner gösterir)
      navigate('/login', {
        replace: true,
        state: { message: 'Password reset successful. Please sign in with your new password.' },
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Reset failed. The link may have expired.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 mb-1">Set new password</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose a strong password (at least 8 characters).
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">New password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Confirm password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm text-gray-500 hover:text-secondary">
          ← Back to sign in
        </Link>
      </div>
    </>
  );
}
