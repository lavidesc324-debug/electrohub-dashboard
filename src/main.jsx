import './styles.css'; // Esta línea debe estar al inicio
import React from 'react';
import { createRoot } from 'react-dom/client';
import ElectroHubDashboard from './electro_hub_web_fase_1_dashboard_interactivo';

const root = createRoot(document.getElementById('root'));
root.render(<ElectroHubDashboard />);