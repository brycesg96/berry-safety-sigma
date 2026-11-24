import { registerOfflineSupport } from './offline-worker';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Application from './Application';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import { AppMotion } from './AppMotion';
import './product-theme.css';
import './yo-seguro.css';
import './safety-treasury.css';
import './workspace-theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Application /><AppMotion /></React.StrictMode>);

registerOfflineSupport();
