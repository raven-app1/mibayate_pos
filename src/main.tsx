import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initUiScale } from './lib/uiScale';
import { ensureLabelFont } from './lib/labelRaster';

initUiScale();
ensureLabelFont();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

