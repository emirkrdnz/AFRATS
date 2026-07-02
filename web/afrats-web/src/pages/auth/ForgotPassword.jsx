import { useState } from 'react';
import { Link } from 'react-router-dom';
import authApi from '../../api/authApi';
import { extractErrorMessage } from '../../api/errorHelper';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authApi.forgotPassword(email);
      // Backend her zaman aynı mesajı döner (account enumeration koruması).
      // Email gerçekten varsa SMTP üzerinden reset link gönderilir.
      setSuccess(true);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not send reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <>
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Check your email</h2>
        <p className="text-sm text-gray-500 mb-6">
          If an account exists for <span className="font-medium text-gray-700">{email}</span>,
          we&apos;ve sent a password reset link. It may take a few minutes to arrive.
        </p>

        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-4">
          Email sent. Check your inbox (and spam folder).
        </div>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-secondary font-medium hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 mb-1">Forgot password</h2>
      <p className="text-sm text-gray-500 mb-6">
        Enter your email and we&apos;ll send you a password reset link.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sending...' : 'Send reset link'}
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
