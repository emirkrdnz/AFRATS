import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white text-sm font-medium">
              AF
            </div>
            <span className="text-2xl font-semibold text-primary">AFRATS</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            AI-Based Financial Risk &amp; Anomaly Detection System
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
