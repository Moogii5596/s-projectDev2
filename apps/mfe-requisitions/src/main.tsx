import React from 'react';
import ReactDOM from 'react-dom/client';
import RequisitionApp from './RequisitionApp';

// Standalone mode (MFE-г standalone-аар ажиллуулах боломж)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RequisitionApp />
  </React.StrictMode>,
);
