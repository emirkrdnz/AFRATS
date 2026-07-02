import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { extractErrorMessage, extractFieldErrors } from '../../api/errorHelper';

export default function Register() {
  const { register } = useAuth();
  
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm({ ...form, [name]: value });
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;

      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setLoading(true);

    try {
      await register(form);
      navigate('/login', {
        state: { message: 'Registration successful. Please verify your email and sign in.' },
      });
    } catch (err) {
      setFieldErrors(extractFieldErrors(err));
      setError(extractErrorMessage(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary transition';
  const inputErrorClass =
    'w-full px-3 py-2.5 border border-red-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-500 transition';

  return (
    <>
      <h2 className="text-xl font-semibold text-gray-800 mb-1">Sign up</h2>
      <p className="text-sm text-gray-500 mb-6">Create a new account</p>

      {error && Object.keys(fieldErrors).length === 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">First name</label>
            <input
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              required
              minLength={2}
              className={fieldErrors.firstName ? inputErrorClass : inputClass}
            />
            {fieldErrors.firstName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Last name</label>
            <input
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              required
              minLength={2}
              className={fieldErrors.lastName ? inputErrorClass : inputClass}
            />
            {fieldErrors.lastName && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            className={fieldErrors.email ? inputErrorClass : inputClass}
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            required
            minLength={8}
            className={fieldErrors.password ? inputErrorClass : inputClass}
          />
          {fieldErrors.password ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">
              Min 8 characters, 1 uppercase, 1 lowercase, 1 digit, 1 special character
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Confirm password</label>
          <input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            required
            className={fieldErrors.confirmPassword ? inputErrorClass : inputClass}
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="tel"
            name="phoneNumber"
            value={form.phoneNumber}
            onChange={handleChange}
            className={fieldErrors.phoneNumber ? inputErrorClass : inputClass}
          />
          {fieldErrors.phoneNumber && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.phoneNumber}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {loading ? 'Creating account...' : 'Sign up'}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-gray-100 text-center">
        <span className="text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-secondary font-medium hover:underline">
            Sign in
          </Link>
        </span>
      </div>
    </>
  );
}