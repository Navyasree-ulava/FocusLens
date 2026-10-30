import { createRoot } from 'react-dom/client';
import App from './App';
import '../../src/styles/main.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Popup root element is missing.');

createRoot(rootElement).render(<App />);
