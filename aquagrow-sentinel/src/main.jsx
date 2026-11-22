import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from './hooks/useRouter';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider>
        <App />
      </RouterProvider>
    </AuthProvider>
  </React.StrictMode>
);
