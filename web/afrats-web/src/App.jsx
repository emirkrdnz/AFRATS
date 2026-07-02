import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HealthMonitorProvider } from './context/HealthMonitorContext';
import AppRoutes from './routes/AppRoutes';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HealthMonitorProvider>
          <AppRoutes />
          <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          closeOnClick
          pauseOnHover
          theme="light"
          toastStyle={{
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-border)',
            fontSize: 13,
          }}
          />
        </HealthMonitorProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
